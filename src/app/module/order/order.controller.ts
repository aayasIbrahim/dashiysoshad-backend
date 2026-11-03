import type { Request, Response } from "express";
import httpStatus from "http-status";
import config from "../../config";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { ListOrdersQuery } from "./order.interface";
import { OrderService } from "./order.service";
import { OrderValidation } from "./order.validation";

const parseListQuery = (query: Request["query"]): ListOrdersQuery => {
	const result = OrderValidation.ListOrdersQueryZodSchema.safeParse(query);
	if (!result.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			result.error.issues[0]?.message ?? "Invalid order query",
		);
	}

	return result.data;
};

const parseTrackingBody = (body: unknown) => {
	const result = OrderValidation.TrackOrderZodSchema.safeParse(body);
	if (!result.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			result.error.issues[0]?.message ?? "Invalid tracking details",
		);
	}

	return result.data;
};

const createOrder = catchAsync(async (req: Request, res: Response) => {
	const order = await OrderService.createOrder(req.body, req.user?.userId);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Order placed successfully",
		data: order,
	});
});

const createBkashCheckout = catchAsync(async (req: Request, res: Response) => {
	const result = OrderValidation.BkashCheckoutZodSchema.safeParse(req.body ?? {});
	if (!result.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			result.error.issues[0]?.message ?? "Invalid bKash checkout request",
		);
	}

	const checkout = await OrderService.createBkashCheckout(
		String(req.params.id),
		req.user,
		result.data.phone,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "bKash checkout created successfully",
		data: checkout,
	});
});

const getBkashPaymentStatus = catchAsync(
	async (req: Request, res: Response) => {
		const result =
			OrderValidation.BkashPaymentStatusQueryZodSchema.safeParse(req.query);
		if (!result.success) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				result.error.issues[0]?.message ?? "Invalid payment status request",
			);
		}

		const status = await OrderService.getBkashPaymentStatus(
			String(req.params.id),
			req.user,
			result.data.phone,
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Payment status fetched successfully",
			data: status,
		});
	},
);

const bkashCallback = catchAsync(async (req: Request, res: Response) => {
	const result = OrderValidation.BkashCallbackQueryZodSchema.safeParse(
		req.query,
	);
	if (!result.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			result.error.issues[0]?.message ?? "Invalid bKash callback",
		);
	}

	const payment = await OrderService.handleBkashCallback(
		result.data.paymentID,
		result.data.status,
	);
	const frontendUrl = config.frontend_url;
	if (!frontendUrl) {
		throw new AppError(
			httpStatus.INTERNAL_SERVER_ERROR,
			"FRONTEND_URL must be configured for the bKash callback",
		);
	}

	const destination = new URL(frontendUrl);
	destination.searchParams.set("orderId", payment.orderId);
	destination.searchParams.set(
		"paymentStatus",
		payment.status === "PAID" ? "success" : payment.status.toLowerCase(),
	);
	res.redirect(httpStatus.SEE_OTHER, destination.toString());
});

const getMyOrders = catchAsync(async (req: Request, res: Response) => {
	if (!req.user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "User information is missing");
	}

	const result = await OrderService.getOrders(
		parseListQuery(req.query),
		req.user.userId,
	); 

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Your orders fetched successfully",
		data: result.orders,
		meta: result.meta,
	});
});

const getAllOrders = catchAsync(async (req: Request, res: Response) => {
	const result = await OrderService.getOrders(parseListQuery(req.query));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Orders fetched successfully",
		data: result.orders,
		meta: result.meta,
	});
});

const getOrderById = catchAsync(async (req: Request, res: Response) => {
	const order = await OrderService.getOrderById(
		String(req.params.id),
		req.user,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Order fetched successfully",
		data: order,
	});
});

const trackGuestOrder = catchAsync(async (req: Request, res: Response) => {
	const { phone } = parseTrackingBody(req.body);
	const order = await OrderService.trackGuestOrder(
		String(req.params.id),
		phone,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Order tracking details fetched successfully",
		data: order,
	});
});

const cancelOrder = catchAsync(async (req: Request, res: Response) => {
	const result = OrderValidation.CancelOrderZodSchema.safeParse(req.body ?? {});
	if (!result.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			result.error.issues[0]?.message ?? "Invalid cancellation request",
		);
	}

	const order = await OrderService.cancelOrder(
		String(req.params.id),
		req.user,
		result.data.phone,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Order cancelled successfully",
		data: order,
	});
});

const updateOrderStatus = catchAsync(async (req: Request, res: Response) => {
	const order = await OrderService.updateOrderStatus(
		String(req.params.id),
		req.body,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Order status updated successfully",
		data: order,
	});
});

const updateShippingFee = catchAsync(async (req: Request, res: Response) => {
	const order = await OrderService.updateShippingFee(
		String(req.params.id),
		req.body.shippingFee,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Order shipping fee updated successfully",
		data: order,
	});
});

export const OrderController = {
	createOrder,
	createBkashCheckout,
	getBkashPaymentStatus,
	bkashCallback,
	getMyOrders,
	getAllOrders,
	getOrderById,
	trackGuestOrder,
	cancelOrder,
	updateOrderStatus,
	updateShippingFee,
};
