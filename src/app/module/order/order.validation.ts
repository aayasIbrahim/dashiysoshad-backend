import z from "zod";
import { OrderStatus, PaymentMethod } from "../../../generated/prisma/enums";

const phone = z
	.string()
	.trim()
	.regex(/^\+?[0-9][0-9\s()-]{6,19}$/, "Enter a valid phone number")
	.transform((value) => value.replace(/\D/g, ""))
	.pipe(z.string().min(7).max(15));

const CreateOrderZodSchema = z
	.object({
		customerName: z.string().trim().min(2).max(120),
		customerPhone: phone,
		shippingAddress: z.string().trim().min(5).max(1000),
		country: z.string().trim().min(2).max(80).default("Bangladesh"),
		orderNotes: z.string().trim().max(1000).optional(),
		paymentMethod: z
			.enum([PaymentMethod.CASH_ON_DELIVERY, PaymentMethod.BKASH])
			.default(PaymentMethod.CASH_ON_DELIVERY),
		items: z
			.array(
				z
					.object({
						productId: z.uuid(),
						quantity: z.number().int().min(1).max(100),
					})
					.strict(),
			)
			.min(1)
			.max(50),
	})
	.strict();

const OrderIdZodSchema = z.object({
	id: z.uuid(),
});

const TrackOrderZodSchema = z
	.object({
		phone,
	})
	.strict();

const ListOrdersQueryZodSchema = z.object({
	orderStatus: z
		.enum([OrderStatus.PENDING, OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.CANCELLED])
		.optional(),
	paymentMethod: z.enum(["CASH_ON_DELIVERY", "BKASH"]).optional(),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const UpdateOrderStatusZodSchema = z
	.object({
		orderStatus: z
			.enum([OrderStatus.PENDING, OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED])
			.optional(),
		isPaid: z.literal(true).optional(),
	})
	.strict()
	.refine((payload) => Object.keys(payload).length > 0, {
		message: "Provide an order status or mark the payment as verified",
	});

const UpdateShippingFeeZodSchema = z
	.object({
		shippingFee: z.coerce.number().finite().min(0).max(9999999999.99),
	})
	.strict();

const CancelOrderZodSchema = z
	.object({
		phone: phone.optional(),
	})
	.strict();

const BkashCheckoutZodSchema = z
	.object({
		phone: phone.optional(),
	})
	.strict();

const BkashPaymentStatusQueryZodSchema = z.object({
	phone: phone.optional(),
});

const BkashCallbackQueryZodSchema = z.object({
	paymentID: z.string().trim().min(1).max(100),
	status: z.enum(["success", "failure", "cancel"]),
});

export const OrderValidation = {
	CreateOrderZodSchema,
	OrderIdZodSchema,
	TrackOrderZodSchema,
	ListOrdersQueryZodSchema,
	UpdateOrderStatusZodSchema,
	UpdateShippingFeeZodSchema,
	CancelOrderZodSchema,
	BkashCheckoutZodSchema,
	BkashPaymentStatusQueryZodSchema,
	BkashCallbackQueryZodSchema,
};
