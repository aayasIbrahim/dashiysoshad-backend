import { NextFunction, Request, Response } from "express";
import z from "zod";
import { catchAsync } from "../utils/catchAsync";
import httpStatus from "http-status";
import { AppError } from "../utils/AppError";

type RequestSource = "body" | "query" | "params";

export const validateRequest = (
	zodSchema: z.ZodType,
	source: RequestSource = "body",
) => {
	return catchAsync((req: Request, res: Response, next: NextFunction) => {
		const payload = req[source] ?? {};

		const result = zodSchema.safeParse(payload);

		if (!result.success) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				result.error.issues[0].message,
			);
		}

		if (source === "body") {
			req.body = result.data;
		} else {
			Object.defineProperty(req, source, {
				configurable: true,
				enumerable: true,
				value: result.data,
				writable: true,
			});
		}

		next();
	});
};
