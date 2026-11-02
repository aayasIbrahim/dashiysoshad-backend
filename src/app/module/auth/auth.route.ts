import { Role } from "../../../generated/prisma/enums";

import { auth } from "../../middleware/checkAuth";

import { AuthController } from "./auth.controller";
import { UserValidation } from "./auth.validation";
import { validateRequest } from "../../middleware/validateReques";
import { Router } from "express";

const router = Router();

router.post(
  "/register",

  validateRequest(UserValidation.RegistrationZodSchema),
  AuthController.registerUser,
);

router.post(
  "/login",

  validateRequest(UserValidation.LoginZodSchema),
  AuthController.loginUser,
);
router.get(
  "/me",
  auth(Role.ADMIN, Role.STAFF, Role.CUSTOMER, Role.SUPER_ADMIN),
  // validateRequest
  AuthController.getMe,
);
router.post("/refresh-token", AuthController.refreshToken);
router.post("/logout", AuthController.logOut);
export const AuthRoutes = router;
