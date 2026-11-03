// biome-ignore lint/correctness/noUnusedImports: <explanation>
// biome-ignore assist/source/organizeImports: <explanation>
import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
	type Application,
	type Request,
	type Response,
} from "express";
import httpStatus from "http-status";

import config from "./app/config";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { AuthRoutes } from "./app/module/auth/auth.route";
import { CategoryRoutes } from "./app/module/category/category.route";
import { ProductRoutes } from "./app/module/product/product.route";
import { OrderRoutes } from "./app/module/order/order.route";

const app: Application = express();

app.use(
	cors({
		origin: config.frontend_url,
		credentials: true,
	}),
);

// Enable URL-encoded form data parsing
app.use(express.urlencoded({ extended: true }));

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cookieParser());

app.use("/api/v1/auth", AuthRoutes);
app.use("/api/v1/categories", CategoryRoutes);
app.use("/api/v1/products", ProductRoutes);
app.use("/api/v1/orders", OrderRoutes);

// Basic route
app.get("/", async (req: Request, res: Response) => {
	res.status(httpStatus.OK).json({
		success: true,
		message: "Welcome to dashiysoshad Backend",
	});
});

app.use(globalErrorHandler);
app.use(notFound);

export default app;
