import type { z } from "zod";
import type { ProductValidation } from "./product.validation";

export type CreateProductPayload = z.infer<
	typeof ProductValidation.CreateProductZodSchema
>;
export type UpdateProductPayload = z.infer<
	typeof ProductValidation.UpdateProductZodSchema
>;
export type ProductListQuery = z.infer<
	typeof ProductValidation.ListProductsQueryZodSchema
>;
export type UploadedProductImage = {
	url: string;
	publicId: string;
};
