import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { ProductListQuery } from "./product.interface";
import { ProductService } from "./product.service";
import { ProductValidation } from "./product.validation";
import { getProductImages, parseProductData } from "./product.utils";

const parseProductQuery = (query: Request["query"]): ProductListQuery => {
	const result = ProductValidation.ListProductsQueryZodSchema.safeParse(query);

	if (!result.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			result.error.issues[0]?.message ?? "Invalid product query",
		);
	}

	return result.data;
};

const createProduct = catchAsync(async (req: Request, res: Response) => {
	if (!req.user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "User information is missing");
	}

	const payload = parseProductData(
		req.is("multipart/form-data") ? (req.body.data ?? req.body) : req.body,
		ProductValidation.CreateProductZodSchema,
	);
	const product = await ProductService.createProduct(
		payload,
		getProductImages(req),
		req.user.userId,
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Product created successfully",
		data: product,
	});
});

const getProducts = catchAsync(async (req: Request, res: Response) => {
	const query = parseProductQuery(req.query);
	const result = await ProductService.getProducts(query);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Products fetched successfully",
		data: result.products,
		meta: result.meta,
	});
});

const getProductById = catchAsync(async (req: Request, res: Response) => {
	const product = await ProductService.getProductById(String(req.params.id));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Product fetched successfully",
		data: product,
	});
});

const updateProduct = catchAsync(async (req: Request, res: Response) => {
	const payload = parseProductData(
		req.is("multipart/form-data") ? (req.body.data ?? {}) : req.body,
		ProductValidation.UpdateProductZodSchema,
	);
	const productImages = getProductImages(req);

	if (Object.keys(payload).length === 0 && productImages.length === 0) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Provide product fields or at least one image",
		);
	}

	const product = await ProductService.updateProduct(
		String(req.params.id),
		payload,
		productImages,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Product updated successfully",
		data: product,
	});
});

const deleteProduct = catchAsync(async (req: Request, res: Response) => {
	const product = await ProductService.deleteProduct(String(req.params.id));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Product deleted successfully",
		data: product,
	});
});

export const ProductController = {
	createProduct,
	getProducts,
	getProductById,
	updateProduct,
	deleteProduct,
};
