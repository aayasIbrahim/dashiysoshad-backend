import type { z } from "zod";
import type { CategoryValidation } from "./category.validation";

export type CreateCategoryPayload = z.infer<
	typeof CategoryValidation.CreateCategoryZodSchema
>;
export type UpdateCategoryPayload = z.infer<
	typeof CategoryValidation.UpdateCategoryZodSchema
>;
export type CategoryListQuery = z.infer<
	typeof CategoryValidation.ListCategoriesQueryZodSchema
>;
