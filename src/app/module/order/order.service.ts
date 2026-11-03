import httpStatus from "http-status";
import { randomBytes } from "node:crypto";
import {
	OrderStatus,
	PaymentMethod,
	PaymentStatus,
	Role,
} from "../../../generated/prisma/enums";
import { Prisma } from "../../../generated/prisma/client";

import {
	createBkashPayment,
	executeBkashPayment,
	queryBkashPayment,
	type BkashPaymentResult,
} from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { RequestUser } from "../../middleware/checkAuth";
import type {
	CreateOrderPayload,
	ListOrdersQuery,
	UpdateOrderStatusPayload,
} from "./order.interface";
import {
	canAccessOrderPayment,
	defaultShippingFee,
	ensureMoneyRange,
	getBkashPaidAt,
	normalizePhone,
	orderInclude,
	verifyBkashResult,
} from "./order.utils";

const PENDING_BKASH_PAYMENT_MAX_AGE_MS = 15 * 60 * 1000;

const createOrder = async (payload: CreateOrderPayload, userId?: string) => {
	const quantities = new Map<string, number>();
	for (const item of payload.items) {
		const quantity = (quantities.get(item.productId) ?? 0) + item.quantity;
		if (quantity > 100) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Maximum quantity per product is 100",
			);
		}
		quantities.set(item.productId, quantity);
	}

	return prisma.$transaction(async (tx) => {
		const products = await tx.product.findMany({
			where: {
				id: { in: [...quantities.keys()] },
				isDeleted: false,
				category: { isDeleted: false },
			},
			select: {
				id: true,
				name: true,
				sku: true,
				price: true,
				stock: true,
			},
		});
		products.sort((left, right) => left.id.localeCompare(right.id));

		if (products.length !== quantities.size) {
			throw new AppError(
				httpStatus.NOT_FOUND,
				"One or more products are unavailable",
			);
		}

		let subtotal = new Prisma.Decimal(0);
		for (const product of products) {
			const quantity = quantities.get(product.id);
			if (quantity === undefined) {
				throw new AppError(httpStatus.BAD_REQUEST, "Invalid order item");
			}

			const result = await tx.product.updateMany({
				where: {
					id: product.id,
					isDeleted: false,
					price: product.price,
					stock: { gte: quantity },
				},
				data: {
					stock: { decrement: quantity },
				},
			});

			if (result.count !== 1) {
				throw new AppError(
					httpStatus.CONFLICT,
					`${product.name} is out of stock or its price changed; refresh and retry`,
				);
			}

			subtotal = subtotal.plus(new Prisma.Decimal(product.price).mul(quantity));
		}

		const discountAmount = new Prisma.Decimal(0);
		const totalPrice = subtotal.plus(defaultShippingFee).minus(discountAmount);
		ensureMoneyRange(subtotal, "Order subtotal");
		ensureMoneyRange(totalPrice, "Order total");
		const orderItems = products.map((product) => {
			const quantity = quantities.get(product.id);
			if (quantity === undefined) {
				throw new AppError(httpStatus.BAD_REQUEST, "Invalid order item");
			}

			return {
				productId: product.id,
				productName: product.name,
				productSku: product.sku,
				quantity,
				price: product.price,
			};
		});

		return tx.order.create({
			data: {
				userId,
				customerName: payload.customerName,
				customerPhone: normalizePhone(payload.customerPhone),
				shippingAddress: payload.shippingAddress,
				country: payload.country,
				orderNotes: payload.orderNotes,
				subtotal,
				shippingFee: defaultShippingFee,
				discountAmount,
				totalPrice,
				paymentMethod: payload.paymentMethod,
				orderItems: { create: orderItems },
			},
			include: orderInclude,
		});
	});
};

const applyGatewayPaymentStatus = async (
	paymentId: string,
	result: BkashPaymentResult,
) => {
	if (result.transactionStatus === "Completed") {
		return completeBkashPayment(paymentId, result);
	}

	const externalStatus =
		typeof result.transactionStatus === "string"
			? result.transactionStatus.toLowerCase()
			: "";
	if (externalStatus !== "cancelled" && externalStatus !== "failed") {
		const payment = await prisma.payment.findUniqueOrThrow({
			where: { id: paymentId },
			select: { orderId: true, status: true },
		});
		return { orderId: payment.orderId, status: payment.status };
	}

	const status =
		externalStatus === "cancelled"
			? PaymentStatus.CANCELLED
			: PaymentStatus.FAILED;
	const payment = await prisma.payment.updateMany({
		where: { id: paymentId, status: PaymentStatus.PENDING },
		data: {
			status,
			gatewayResponse: {
				transactionStatus:
					typeof result.transactionStatus === "string"
						? result.transactionStatus
						: null,
			},
		},
	});
	const currentPayment = await prisma.payment.findUniqueOrThrow({
		where: { id: paymentId },
		select: { orderId: true, status: true },
	});
	return {
		orderId: currentPayment.orderId,
		status: payment.count ? status : currentPayment.status,
	};
};



const createBkashCheckout = async (
	orderId: string,
	actor?: RequestUser,
	phone?: string,
) => {
	const order = await prisma.order.findUnique({
		where: { id: orderId },
	});

	if (!order) {
		throw new AppError(httpStatus.NOT_FOUND, "Order not found");
	}
	canAccessOrderPayment(order, actor, phone);

	if (order.paymentMethod !== PaymentMethod.BKASH) {
		throw new AppError(
			httpStatus.CONFLICT,
			"This order does not use bKash payment",
		);
	}
	if (order.orderStatus !== OrderStatus.PENDING || order.isPaid) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Only unpaid pending orders can start a bKash payment",
		);
	}

	const existingPayment = await prisma.payment.findFirst({
		where: { orderId, status: PaymentStatus.PENDING },
		orderBy: { createdAt: "desc" },
	});
	if (
		existingPayment &&
		Date.now() - existingPayment.createdAt.getTime() <
			PENDING_BKASH_PAYMENT_MAX_AGE_MS
	) {
		const gatewayResponse = existingPayment.gatewayResponse;
		if (
			existingPayment.bkashPaymentId &&
			gatewayResponse &&
			typeof gatewayResponse === "object" &&
			gatewayResponse !== null &&
			"bkashURL" in gatewayResponse &&
			typeof gatewayResponse.bkashURL === "string"
		) {
			return {
				orderId,
				paymentId: existingPayment.id,
				bkashURL: gatewayResponse.bkashURL,
				status: existingPayment.status,
			};
		}
		throw new AppError(
			httpStatus.CONFLICT,
			"A bKash checkout is already being initialized for this order",
		);
	}
	if (existingPayment) {
		await prisma.payment.updateMany({
			where: { id: existingPayment.id, status: PaymentStatus.PENDING },
			data: { status: PaymentStatus.CANCELLED },
		});
	}

	const merchantInvoiceNumber = `D${Date.now()}${randomBytes(3)
		.toString("hex")
		.toUpperCase()}`;
	const payment = await prisma.payment.create({
		data: {
			orderId,
			status: PaymentStatus.PENDING,
			amount: order.totalPrice,
			currency: "BDT",
			paymentMethod: PaymentMethod.BKASH,
			merchantInvoiceNumber,
			payerReference: order.customerPhone,
		},
	});

	try {
		const result = await createBkashPayment({
			amount: order.totalPrice.toFixed(2),
			payerReference: order.customerPhone,
			merchantInvoiceNumber,
		});
		if (
			typeof result.paymentID !== "string" ||
			!result.paymentID ||
			typeof result.bkashURL !== "string" ||
			!result.bkashURL
		) {
			throw new AppError(
				httpStatus.BAD_GATEWAY,
				"Invalid bKash checkout response",
			);
		}

		const updatedPayment = await prisma.payment.update({
			where: { id: payment.id },
			data: {
				bkashPaymentId: result.paymentID,
				gatewayResponse: { bkashURL: result.bkashURL },
			},
		});

		return {
			orderId,
			paymentId: updatedPayment.id,
			bkashURL: result.bkashURL,
			status: updatedPayment.status,
		};
	} catch (error) {
		await prisma.payment.update({
			where: { id: payment.id },
			data: { status: PaymentStatus.FAILED },
		});
		throw error;
	}
};


const completeBkashPayment = async (
	paymentId: string,
	result: BkashPaymentResult,
) => {
	const payment = await prisma.payment.findUnique({
		where: { id: paymentId },
	});
	if (!payment) {
		throw new AppError(httpStatus.NOT_FOUND, "Payment not found");
	}
	if (payment.status === PaymentStatus.PAID) {
		return { orderId: payment.orderId, status: payment.status };
	}
	verifyBkashResult(payment, result);
	const verifiedAt = new Date();
	const { paidAt, source: paidAtSource } = getBkashPaidAt(
		result,
		payment.createdAt,
		verifiedAt,
	);
	const gatewayAudit = {
		transactionStatus: "Completed",
		paymentID: payment.bkashPaymentId,
		trxID: result.trxID as string,
		amount: payment.amount.toFixed(2),
		currency: payment.currency,
		merchantInvoiceNumber: payment.merchantInvoiceNumber,
		paymentExecuteTime: paidAtSource === "BKASH" ? paidAt.toISOString() : null,
		paidAtSource,
		verifiedAt: verifiedAt.toISOString(),
	} satisfies Prisma.InputJsonObject;

	await prisma.$transaction(async (tx) => {
		const updatedPayment = await tx.payment.updateMany({
			where: { id: paymentId, status: PaymentStatus.PENDING },
			data: {
				status: PaymentStatus.PAID,
				bkashTrxId: result.trxID as string,
				paidAt,
				gatewayResponse: gatewayAudit,
			},
		});
		if (updatedPayment.count === 1) {
			await tx.order.update({
				where: { id: payment.orderId },
				data: { isPaid: true },
			});
		}
	});

	const finalPayment = await prisma.payment.findUniqueOrThrow({
		where: { id: paymentId },
		select: { orderId: true, status: true },
	});
	if (finalPayment.status !== PaymentStatus.PAID) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Payment status changed while recording the verified transaction",
		);
	}
	return { orderId: finalPayment.orderId, status: finalPayment.status };
};

const handleBkashCallback = async (paymentId: string, callbackStatus: string) => {
	const payment = await prisma.payment.findUnique({
		where: { bkashPaymentId: paymentId },
	});
	if (!payment) {
		throw new AppError(httpStatus.NOT_FOUND, "bKash payment not found");
	}
	if (payment.status === PaymentStatus.PAID) {
		return { orderId: payment.orderId, status: payment.status };
	}

	let result: BkashPaymentResult;
	if (callbackStatus.toLowerCase() === "success") {
		try {
			result = await executeBkashPayment(paymentId);
		} catch {
			result = await queryBkashPayment(paymentId);
		}
	} else {
		result = await queryBkashPayment(paymentId);
	}

	return applyGatewayPaymentStatus(payment.id, result);
};

const getBkashPaymentStatus = async (
	orderId: string,
	actor?: RequestUser,
	phone?: string,
) => {
	const order = await prisma.order.findUnique({ where: { id: orderId } });
	if (!order) {
		throw new AppError(httpStatus.NOT_FOUND, "Order not found");
	}
	canAccessOrderPayment(order, actor, phone);

	let payment = await prisma.payment.findFirst({
		where: { orderId, paymentMethod: PaymentMethod.BKASH },
		orderBy: { createdAt: "desc" },
		select: {
			id: true,
			status: true,
			amount: true,
			currency: true,
			bkashTrxId: true,
			paidAt: true,
			createdAt: true,
			bkashPaymentId: true,
		},
	});
	if (payment?.status === PaymentStatus.PENDING && payment.bkashPaymentId) {
		const providerResult = await queryBkashPayment(payment.bkashPaymentId);
		await applyGatewayPaymentStatus(payment.id, providerResult);
		payment = await prisma.payment.findFirst({
			where: { orderId, paymentMethod: PaymentMethod.BKASH },
			orderBy: { createdAt: "desc" },
			select: {
				id: true,
				status: true,
				amount: true,
				currency: true,
				bkashTrxId: true,
				paidAt: true,
				createdAt: true,
				bkashPaymentId: true,
			},
		});
	}
	const safePayment = payment
		? {
				id: payment.id,
				status: payment.status,
				amount: payment.amount,
				currency: payment.currency,
				bkashTrxId: payment.bkashTrxId,
				paidAt: payment.paidAt,
				createdAt: payment.createdAt,
			}
		: null;
	return {
		orderId,
		orderStatus: order.orderStatus,
		isPaid: order.isPaid,
		payment: safePayment,
	};
};

const getOrders = async (query: ListOrdersQuery, userId?: string) => {
	const where: Prisma.OrderWhereInput = {
		...(userId ? { userId } : {}),
		...(query.orderStatus ? { orderStatus: query.orderStatus } : {}),
		...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
	};

	const [orders, total] = await prisma.$transaction([
		prisma.order.findMany({
			where,
			include: orderInclude,
			orderBy: { createdAt: query.sortOrder },
			skip: (query.page - 1) * query.limit,
			take: query.limit,
		}),
		prisma.order.count({ where }),
	]);

	return {
		orders,
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPages: Math.ceil(total / query.limit),
		},
	};
};

const getOrderById = async (id: string, user?: RequestUser) => {
	const order = await prisma.order.findUnique({
		where: { id },
		include: orderInclude,
	});

	if (!order) {
		throw new AppError(httpStatus.NOT_FOUND, "Order not found");
	}

	if (!user || (user.role === Role.CUSTOMER && order.userId !== user.userId)) {
		throw new AppError(httpStatus.FORBIDDEN, "You cannot access this order");
	}

	return order;
};

const trackGuestOrder = async (id: string, phone: string) => {
	console.log({id,phone})
	const order = await prisma.order.findFirst({
		where: {
			id,
			userId: null,
			customerPhone: normalizePhone(phone),
		},
		include: orderInclude,
	});

	if (!order) {
		throw new AppError(httpStatus.NOT_FOUND, "Order not found");
	}

	return order;
};

const cancelOrder = async (
	id: string,
	actor: RequestUser | undefined,
	phone?: string,
) =>
	prisma.$transaction(async (tx) => {
		const order = await tx.order.findUnique({
			where: { id },
			include: { orderItems: true },
		});

		if (!order) {
			throw new AppError(httpStatus.NOT_FOUND, "Order not found");
		}

		const isAdmin =
			actor?.role === Role.SUPER_ADMIN || actor?.role === Role.ADMIN;
		const isOwner = actor?.userId === order.userId;
		const isVerifiedGuest =
			!actor &&
			order.userId === null &&
			phone !== undefined &&
			order.customerPhone === normalizePhone(phone);

		if (!isAdmin && !isOwner && !isVerifiedGuest) {
			throw new AppError(httpStatus.FORBIDDEN, "You cannot cancel this order");
		}

		if (order.isPaid) {
			throw new AppError(
				httpStatus.CONFLICT,
				"Paid orders cannot be cancelled without a refund process",
			);
		}

		const pendingPayment = await tx.payment.findFirst({
			where: { orderId: id, status: PaymentStatus.PENDING },
			orderBy: { createdAt: "desc" },
		});
		if (
			pendingPayment &&
			Date.now() - pendingPayment.createdAt.getTime() <
				PENDING_BKASH_PAYMENT_MAX_AGE_MS
		) {
			throw new AppError(
				httpStatus.CONFLICT,
				"Wait for the bKash checkout to finish before cancelling this order",
			);
		}
		if (pendingPayment) {
			await tx.payment.updateMany({
				where: { id: pendingPayment.id, status: PaymentStatus.PENDING },
				data: { status: PaymentStatus.CANCELLED },
			});
		}

		if (
			order.orderStatus !== OrderStatus.PENDING &&
			!(isAdmin && order.orderStatus === OrderStatus.PROCESSING)
		) {
			throw new AppError(
				httpStatus.CONFLICT,
				"Only pending orders can be cancelled by customers; admins may also cancel processing orders",
			);
		}

		const updated = await tx.order.updateMany({
			where: {
				id,
				orderStatus: order.orderStatus,
				isPaid: false,
			},
			data: { orderStatus: OrderStatus.CANCELLED },
		});

		if (updated.count !== 1) {
			throw new AppError(
				httpStatus.CONFLICT,
				"Order changed while it was being cancelled; please retry",
			);
		}

		for (const item of order.orderItems) {
			await tx.product.update({
				where: { id: item.productId },
				data: { stock: { increment: item.quantity } },
			});
		}

		return tx.order.findUniqueOrThrow({
			where: { id },
			include: orderInclude,
		});
	});

const allowedNextStatuses: Record<OrderStatus, OrderStatus[]> = {
	PENDING: [OrderStatus.PROCESSING],
	PROCESSING: [OrderStatus.SHIPPED],
	SHIPPED: [OrderStatus.DELIVERED],
	DELIVERED: [],
	CANCELLED: [],
};

const updateOrderStatus = async (
	id: string,
	payload: UpdateOrderStatusPayload,
) =>
	prisma.$transaction(async (tx) => {
		const order = await tx.order.findUnique({ where: { id } });
		if (!order) {
			throw new AppError(httpStatus.NOT_FOUND, "Order not found");
		}

		if (order.orderStatus === OrderStatus.CANCELLED) {
			throw new AppError(
				httpStatus.CONFLICT,
				"Cancelled orders cannot be updated",
			);
		}

		if (
			payload.orderStatus &&
			payload.orderStatus !== order.orderStatus &&
			!allowedNextStatuses[order.orderStatus].includes(payload.orderStatus)
		) {
			throw new AppError(
				httpStatus.CONFLICT,
				`Cannot move an order from ${order.orderStatus} to ${payload.orderStatus}`,
			);
		}

		const nextStatus = payload.orderStatus ?? order.orderStatus;
		const isPaid = order.isPaid || payload.isPaid === true;

		if (
			payload.isPaid &&
			order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY &&
			nextStatus !== OrderStatus.DELIVERED
		) {
			throw new AppError(
				httpStatus.CONFLICT,
				"Cash-on-delivery payment can only be confirmed when the order is delivered",
			);
		}
		if (payload.isPaid && order.paymentMethod === PaymentMethod.BKASH) {
			throw new AppError(
				httpStatus.CONFLICT,
				"bKash payments can only be confirmed by the verified gateway callback",
			);
		}

		if (
			order.paymentMethod === PaymentMethod.BKASH &&
			(nextStatus === OrderStatus.PROCESSING ||
				nextStatus === OrderStatus.SHIPPED ||
				nextStatus === OrderStatus.DELIVERED) &&
			!isPaid
		) {
			throw new AppError(
				httpStatus.CONFLICT,
				"Verify the bKash payment before processing this order",
			);
		}

		if (
			order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY &&
			nextStatus === OrderStatus.DELIVERED &&
			!isPaid
		) {
			throw new AppError(
				httpStatus.CONFLICT,
				"Confirm cash collection when marking the order delivered",
			);
		}

		const updated = await tx.order.updateMany({
			where: {
				id,
				orderStatus: order.orderStatus,
				isPaid: order.isPaid,
			},
			data: {
				orderStatus: nextStatus,
				isPaid,
			},
		});

		if (updated.count !== 1) {
			throw new AppError(
				httpStatus.CONFLICT,
				"Order changed while it was being updated; please retry",
			);
		}

		return tx.order.findUniqueOrThrow({
			where: { id },
			include: orderInclude,
		});
	});

const updateShippingFee = async (id: string, amount: number) => {
	const shippingFee = new Prisma.Decimal(amount.toFixed(2));
	ensureMoneyRange(shippingFee, "Shipping fee");

	return prisma.$transaction(async (tx) => {
		const order = await tx.order.findUnique({ where: { id } });
		if (!order) {
			throw new AppError(httpStatus.NOT_FOUND, "Order not found");
		}

		if (order.orderStatus !== OrderStatus.PENDING || order.isPaid) {
			throw new AppError(
				httpStatus.CONFLICT,
				"Shipping can only be changed on unpaid pending orders",
			);
		}
		const pendingPayment = await tx.payment.findFirst({
			where: { orderId: id, status: PaymentStatus.PENDING },
			select: { id: true },
		});
		if (pendingPayment) {
			throw new AppError(
				httpStatus.CONFLICT,
				"Shipping cannot be changed while a bKash payment is pending",
			);
		}

		const totalPrice = order.subtotal
			.plus(shippingFee)
			.minus(order.discountAmount);
		ensureMoneyRange(totalPrice, "Order total");

		const updated = await tx.order.updateMany({
			where: {
				id,
				orderStatus: OrderStatus.PENDING,
				isPaid: false,
			},
			data: { shippingFee, totalPrice },
		});

		if (updated.count !== 1) {
			throw new AppError(
				httpStatus.CONFLICT,
				"Order changed while shipping was being updated; please retry",
			);
		}

		return tx.order.findUniqueOrThrow({
			where: { id },
			include: orderInclude,
		});
	});
};

export const OrderService = {
	createOrder,
	createBkashCheckout,
	handleBkashCallback,
	getBkashPaymentStatus,
	getOrders,
	getOrderById,
	trackGuestOrder,
	cancelOrder,
	updateOrderStatus,
	updateShippingFee,
};
