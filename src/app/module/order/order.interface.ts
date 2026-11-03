import type { z } from "zod";
import type { OrderValidation } from "./order.validation";

export type CreateOrderPayload = z.infer<
	typeof OrderValidation.CreateOrderZodSchema
>;
export type ListOrdersQuery = z.infer<
	typeof OrderValidation.ListOrdersQueryZodSchema
>;
export type UpdateOrderStatusPayload = z.infer<
	typeof OrderValidation.UpdateOrderStatusZodSchema
>;
