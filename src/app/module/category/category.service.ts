import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type {
	CategoryListQuery,
	CreateCategoryPayload,
	UpdateCategoryPayload,
} from "./category.interface";

const categoryInclude = {
	_count: {
		select: {
			products: true,
		},
	},
	user: {
		select: {
			id: true,
			name: true,
			email: true,
		},
	},
} as const;

const createCategory = (payload: CreateCategoryPayload, createdById: string) =>
	prisma.category.create({
		data: {
			...payload,
			userId: createdById,
		},
		include: categoryInclude,
	});

const getCategories = async (query: CategoryListQuery) => {
	const where = {
		isDeleted: false,
		...(query.search
			? { name: { contains: query.search, mode: "insensitive" as const } }
			: {}),
	};

	const [categories, total] = await prisma.$transaction([
		prisma.category.findMany({
			where,
			include: categoryInclude,
			orderBy: { name: query.sortOrder },
			skip: (query.page - 1) * query.limit,
			take: query.limit,
		}),
		prisma.category.count({ where }),
	]);

	return {
		categories,
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPages: Math.ceil(total / query.limit),
		},
	};
};

const getCategoryById = async (id: string) => {
	const category = await prisma.category.findFirst({
		where: { id, isDeleted: false },
		include: categoryInclude,
	});

	if (!category) {
		throw new AppError(httpStatus.NOT_FOUND, "Category not found");
	}

	return category;
};

const updateCategory = async (id: string, payload: UpdateCategoryPayload) => {
	const category = await prisma.category.findFirst({
		where: { id, isDeleted: false },
		select: { id: true },
	});

	if (!category) {
		throw new AppError(httpStatus.NOT_FOUND, "Category not found");
	}

	return prisma.category.update({
		where: { id },
		data: payload,
		include: categoryInclude,
	});
};

const deleteCategory = async (id: string) => {
	const category = await prisma.category.findFirst({
		where: { id, isDeleted: false },
		select: {
			id: true,
			_count: {
				select: {
					products: true,
				},
			},
		},
	});

	if (!category) {
		throw new AppError(httpStatus.NOT_FOUND, "Category not found");
	}

	if (category._count.products > 0) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Cannot delete a category that contains products",
		);
	}

	return prisma.category.update({
		where: { id },
		data: {
			isDeleted: true,
			deletedAt: new Date(),
		},
		include: categoryInclude,
	});
};

export const CategoryService = {
	createCategory,
	getCategories,
	getCategoryById,
	updateCategory,
	deleteCategory,
};
