import httpStatus from "http-status";
import { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../../lib/cloudinary";
import { AppError } from "../../utils/AppError";
import { prisma } from "../../lib/prisma";
import { UploadedProductImage } from "./product.interface";
import { Request } from "express";

export const productInclude = {
	category: {
		select: {
			id: true,
			name: true,
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

export const uploadProductImage = (file: Express.Multer.File) =>
	new Promise<UploadApiResponse>((resolve, reject) => {
		cloudinary.uploader
			.upload_stream(
				{
					folder: "products",
					resource_type: "image",
				},
				(error, result) => {
					if (error) {
						reject(error);
						return;
					}

					if (!result) {
						reject(
							new AppError(
								httpStatus.BAD_GATEWAY,
								"Cloudinary did not return an uploaded image",
							),
						);
						return;
					}

					resolve(result);
				},
			)
			.end(file.buffer);
	});

export const deleteCloudinaryImages = async (publicIds: string[]) => {
	const results = await Promise.allSettled(
		publicIds.map((publicId) =>
			cloudinary.uploader.destroy(publicId, {
				invalidate: true,
				resource_type: "image",
			}),
		),
	);

	for (const [index, result] of results.entries()) {
		if (
			result.status === "rejected" ||
			(result.status === "fulfilled" &&
				result.value.result !== "ok" &&
				result.value.result !== "not found")
		) {
			console.error("Failed to remove product image from Cloudinary", {
				publicId: publicIds[index],
				error:
					result.status === "rejected" ? result.reason : result.value.result,
			});
		}
	}
};

export const uploadProductImages = async (files: Express.Multer.File[]) => {
	const uploadedImages: UploadedProductImage[] = [];

	try {
		for (const file of files) {
			const result = await uploadProductImage(file);
			uploadedImages.push({
				url: result.secure_url,
				publicId: result.public_id,
			});
		}
	} catch (error) {
		await deleteCloudinaryImages(uploadedImages.map((image) => image.publicId));
		throw error;
	}

	return uploadedImages;
};

export const ensureCategoryExists = async (
	categoryId: string | null | undefined,
) => {
	if (!categoryId) {
		return;
	}

	const category = await prisma.category.findFirst({
		where: { id: categoryId, isDeleted: false },
		select: { id: true },
	});

	if (!category) {
		throw new AppError(httpStatus.NOT_FOUND, "Category not found");
	}
};
export const parseProductData = <T>(
	data: unknown,
	schema: {
		safeParse: (
			input: unknown,
		) =>
			| { success: true; data: T }
			| { success: false; error: { issues: { message: string }[] } };
	},
): T => {
	let payload = data;

	if (typeof data === "string") {
		try {
			payload = JSON.parse(data);
		} catch {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Product data must be valid JSON",
			);
		}
	}

	const result = schema.safeParse(payload);
	if (!result.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			result.error.issues[0]?.message ?? "Invalid product data",
		);
	}

	return result.data;
};

export const getProductImages = (req: Request): Express.Multer.File[] => {
	const files = req.files;
	if (!files || Array.isArray(files)) {
		return [];
	}

	return files.productImages ?? [];
};
