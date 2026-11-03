import type { Express } from "express";
import httpStatus from "http-status";
import { Prisma } from "../../../generated/prisma/client";

import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type {
	CreateProductPayload,
	ProductListQuery,
	UpdateProductPayload,
} from "./product.interface";
import {
	deleteCloudinaryImages,
	ensureCategoryExists,
	productInclude,
	uploadProductImages,
} from "./product.utils";

const createProduct = async (
	payload: CreateProductPayload,
	productImages: Express.Multer.File[],
	createdById: string,
) => {
	await ensureCategoryExists(payload.categoryId);
	const uploadedImages = await uploadProductImages(productImages);

	try {
		return await prisma.product.create({
			data: {
				...payload,
				userId: createdById,
				images: uploadedImages.map((image) => image.url),
				imagePublicIds: uploadedImages.map((image) => image.publicId),
				stock: payload.stock ?? 0,
			},
			include: productInclude,
		});
	} catch (error) {
		await deleteCloudinaryImages(uploadedImages.map((image) => image.publicId));
		throw error;
	}
};

const getProducts = async (query: ProductListQuery) => {
	const {
		search,
		categoryId,
		minPrice,
		maxPrice,
		inStock,
		page,
		limit,
		sortBy,
		sortOrder,
	} = query;

	const where: Prisma.ProductWhereInput = {
		isDeleted: false,
		...(categoryId ? { categoryId } : {}),
		...(search
			? {
					OR: [
						{ name: { contains: search, mode: "insensitive" } },
						{ description: { contains: search, mode: "insensitive" } },
						{ sku: { contains: search, mode: "insensitive" } },
					],
				}
			: {}),
		...(minPrice !== undefined || maxPrice !== undefined
			? {
					price: {
						...(minPrice !== undefined ? { gte: minPrice } : {}),
						...(maxPrice !== undefined ? { lte: maxPrice } : {}),
					},
				}
			: {}),
		...(inStock === "true"
			? { stock: { gt: 0 } }
			: inStock === "false"
				? { stock: 0 }
				: {}),
	};

	const [products, total] = await prisma.$transaction([
		prisma.product.findMany({
			where,
			include: productInclude,
			orderBy: { [sortBy]: sortOrder },
			skip: (page - 1) * limit,
			take: limit,
		}),
		prisma.product.count({ where }),
	]);

	return {
		products,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const getProductById = async (id: string) => {
	const product = await prisma.product.findFirst({
		where: { id, isDeleted: false },
		include: productInclude,
	});

	if (!product) {
		throw new AppError(httpStatus.NOT_FOUND, "Product not found");
	}

	return product;
};

const updateProduct = async (
	id: string,
	payload: UpdateProductPayload,
	productImages: Express.Multer.File[],
) => {
	await ensureCategoryExists(payload.categoryId);

	const existingProduct = await prisma.product.findFirst({
		where: { id, isDeleted: false },
		select: { imagePublicIds: true },
	});

	if (!existingProduct) {
		throw new AppError(httpStatus.NOT_FOUND, "Product not found");
	}

	const uploadedImages = await uploadProductImages(productImages);

	try {
		const updatedProduct = await prisma.product.update({
			where: { id, isDeleted: false },
			data: {
				...payload,
				...(uploadedImages.length > 0
					? {
							images: uploadedImages.map((image) => image.url),
							imagePublicIds: uploadedImages.map((image) => image.publicId),
						}
					: {}),
			},
			include: productInclude,
		});

		if (uploadedImages.length > 0) {
			await deleteCloudinaryImages(existingProduct.imagePublicIds);
		}

		return updatedProduct;
	} catch (error) {
		await deleteCloudinaryImages(uploadedImages.map((image) => image.publicId));
		throw error;
	}
};

const deleteProduct = async (id: string) => {
	return prisma.product.update({
		where: { id, isDeleted: false },
		data: {
			isDeleted: true,
			deletedAt: new Date(),
		},
		include: productInclude,
	});
};

export const ProductService = {
	createProduct,
	getProducts,
	getProductById,
	updateProduct,
	deleteProduct,
};
