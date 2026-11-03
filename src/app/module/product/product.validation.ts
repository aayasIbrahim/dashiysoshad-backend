import z from "zod";

const productFields = {
	name: z.string().trim().min(1).max(160),
	description: z.string().trim().max(5000).nullable(),
	price: z.coerce.number().finite().min(0),
	sku: z
		.string()
		.trim()
		.min(1)
		.max(80)
		.transform((sku) => sku.toUpperCase()),
	stock: z.coerce.number().int().min(0),
	weight: z.string().trim().max(100).nullable(),
	categoryId: z.uuid(),
};

const CreateProductZodSchema = z.object({
	name: productFields.name,
	description: productFields.description.optional(),
	price: productFields.price,
	sku: productFields.sku,
	stock: productFields.stock.optional(),
	weight: productFields.weight.optional(),
	categoryId: productFields.categoryId,
});

const UpdateProductZodSchema = z.object({
	name: productFields.name.optional(),
	description: productFields.description.optional(),
	price: productFields.price.optional(),
	sku: productFields.sku.optional(),
	stock: productFields.stock.optional(),
	weight: productFields.weight.optional(),
	categoryId: productFields.categoryId.optional(),
});

const ProductIdZodSchema = z.object({
	id: z.uuid(),
});

const ListProductsQueryZodSchema = z
	.object({
		search: z.string().trim().min(1).max(100).optional(),
		categoryId: z.uuid().optional(),
		minPrice: z.coerce.number().finite().min(0).optional(),
		maxPrice: z.coerce.number().finite().min(0).optional(),
		inStock: z.enum(["true", "false"]).optional(),
		page: z.coerce.number().int().min(1).default(1),
		limit: z.coerce.number().int().min(1).max(100).default(20),
		sortBy: z
			.enum(["name", "price", "stock", "createdAt", "updatedAt"])
			.default("createdAt"),
		sortOrder: z.enum(["asc", "desc"]).default("desc"),
	})
	.refine(
		({ minPrice, maxPrice }) =>
			minPrice === undefined || maxPrice === undefined || minPrice <= maxPrice,
		{
			message: "minPrice cannot be greater than maxPrice",
			path: ["minPrice"],
		},
	);

export const ProductValidation = {
	CreateProductZodSchema,
	UpdateProductZodSchema,
	ProductIdZodSchema,
	ListProductsQueryZodSchema,
};
