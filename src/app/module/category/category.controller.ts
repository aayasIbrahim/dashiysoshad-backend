import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { CategoryListQuery } from "./category.interface";
import { CategoryService } from "./category.service";
import { CategoryValidation } from "./category.validation";

const parseCategoryQuery = (query: Request["query"]): CategoryListQuery => {
	const result =
		CategoryValidation.ListCategoriesQueryZodSchema.safeParse(query);

	if (!result.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			result.error.issues[0]?.message ?? "Invalid category query",
		);
	}

	return result.data;
};

const createCategory = catchAsync(async (req: Request, res: Response) => {
	const category = await CategoryService.createCategory(req.body);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Category created successfully",
		data: category,
	});
});

const getCategories = catchAsync(async (req: Request, res: Response) => {
	const result = await CategoryService.getCategories(
		parseCategoryQuery(req.query),
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Categories fetched successfully",
		data: result.categories,
		meta: result.meta,
	});
});

const getCategoryById = catchAsync(async (req: Request, res: Response) => {
	const category = await CategoryService.getCategoryById(String(req.params.id));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Category fetched successfully",
		data: category,
	});
});

const updateCategory = catchAsync(async (req: Request, res: Response) => {
	const category = await CategoryService.updateCategory(
		String(req.params.id),
		req.body,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Category updated successfully",
		data: category,
	});
});

const deleteCategory = catchAsync(async (req: Request, res: Response) => {
	const category = await CategoryService.deleteCategory(String(req.params.id));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Category deleted successfully",
		data: category,
	});
});

export const CategoryController = {
	createCategory,
	getCategories,
	getCategoryById,
	updateCategory,
	deleteCategory,
};
