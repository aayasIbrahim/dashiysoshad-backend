import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateReques";
import { CategoryController } from "./category.controller";
import { CategoryValidation } from "./category.validation";

const router = Router();
const categoryIdValidation = validateRequest(
	CategoryValidation.CategoryIdZodSchema,
	"params",
);

router
	.route("/")
	.get(CategoryController.getCategories)
	.post(
		auth(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF),
		validateRequest(CategoryValidation.CreateCategoryZodSchema),
		CategoryController.createCategory,
	);

router
	.route("/:id")
	.get(categoryIdValidation, CategoryController.getCategoryById)
	.patch(
		auth(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF),
		categoryIdValidation,
		validateRequest(CategoryValidation.UpdateCategoryZodSchema),
		CategoryController.updateCategory,
	)
	.delete(
		auth(Role.SUPER_ADMIN, Role.ADMIN),
		categoryIdValidation,
		CategoryController.deleteCategory,
	);

export const CategoryRoutes = router;
