import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateReques";
import { ProductController } from "./product.controller";
import { ProductValidation } from "./product.validation";
import { upload } from "../../lib/multer";

const router = Router();
const productIdValidation = validateRequest(
	ProductValidation.ProductIdZodSchema,
	"params",
);

router
	.route("/")
	.get(ProductController.getProducts)
	.post(
		auth(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF),
		upload.fields([
			{
				name: "productImages",
				maxCount: 10,
			},
		]),
		ProductController.createProduct,
	);

router
	.route("/:id")
	.get(productIdValidation, ProductController.getProductById)
	.patch(
		auth(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF),
		productIdValidation,
		upload.fields([
			{
				name: "productImages",
				maxCount: 10,
			},
		]),
		ProductController.updateProduct,
	)
	.delete(
		auth(Role.SUPER_ADMIN, Role.ADMIN),
		productIdValidation,
		ProductController.deleteProduct,
	);

export const ProductRoutes = router;
