import z from "zod";

const CreateCategoryZodSchema = z.object({
	name: z.string().trim().min(1).max(100),
});

const UpdateCategoryZodSchema = z
	.object({
		name: z.string().trim().min(1).max(100),
	})
	.partial()
	.refine((payload) => Object.keys(payload).length > 0, {
		message: "At least one field must be provided",
	});

const CategoryIdZodSchema = z.object({
	id: z.uuid(),
});

const ListCategoriesQueryZodSchema = z.object({
	search: z.string().trim().min(1).max(100).optional(),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export const CategoryValidation = {
	CreateCategoryZodSchema,
	UpdateCategoryZodSchema,
	CategoryIdZodSchema,
	ListCategoriesQueryZodSchema,
};
