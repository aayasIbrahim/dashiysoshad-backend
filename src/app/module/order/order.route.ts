import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth, optionalAuth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateReques";
import { OrderController } from "./order.controller";
import { OrderValidation } from "./order.validation";

const router = Router();
const orderIdValidation = validateRequest(
	OrderValidation.OrderIdZodSchema,
	"params",
);

router.post(
	"/",
	optionalAuth(),
	validateRequest(OrderValidation.CreateOrderZodSchema),
	OrderController.createOrder,
);

router.get("/bkash/callback", OrderController.bkashCallback);

router.post(
	"/:id/bkash",
	optionalAuth(),
	orderIdValidation,
	OrderController.createBkashCheckout,
);

router.get(
	"/:id/payment",
	optionalAuth(),
	orderIdValidation,
	OrderController.getBkashPaymentStatus,
);

router.get(
	"/mine",
	auth(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF, Role.CUSTOMER),
	OrderController.getMyOrders,
);

router.get(
	"/",
	auth(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF),
	OrderController.getAllOrders,
);

router.post("/track/:id", orderIdValidation, OrderController.trackGuestOrder);

router.post(
	"/:id/cancel",
	optionalAuth(),
	orderIdValidation,
	OrderController.cancelOrder,
);

router.patch(
	"/:id/status",
	auth(Role.SUPER_ADMIN, Role.ADMIN),
	orderIdValidation,
	validateRequest(OrderValidation.UpdateOrderStatusZodSchema),
	OrderController.updateOrderStatus,
);

router.patch(
	"/:id/shipping",
	auth(Role.SUPER_ADMIN, Role.ADMIN),
	orderIdValidation,
	validateRequest(OrderValidation.UpdateShippingFeeZodSchema),
	OrderController.updateShippingFee,
);

router.get(
	"/:id",
	auth(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF, Role.CUSTOMER),
	orderIdValidation,
	OrderController.getOrderById,
);

export const OrderRoutes = router;
