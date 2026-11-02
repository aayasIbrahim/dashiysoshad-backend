import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from "jsonwebtoken";
import { UserStatus, type Role } from "../../generated/prisma/enums";
import config from "../config";
import { prisma } from "../lib/prisma";
import { catchAsync } from "../utils/catchAsync";
import { jwtUtils } from "../utils/jwt";
import httpStatus from "http-status";
import { AppError } from "../utils/AppError";

export interface RequestUser {
	email: string;
	name: string;
	userId: string;
	role: Role;
}
declare global {
	namespace Express {
		interface Request {
			user?: RequestUser;
		}
	}
}

// auth(Role.ADMIN, Role.USER, Role.Author)
// auth() => ...requiredRoles => [Role.ADMIN, Role.USER, Role.AUTHOR]
export const auth = (...requiredRoles: Role[]) => {
	return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
		const token = req.cookies.accessToken
			? req.cookies.accessToken
			: req.headers.authorization?.startsWith("Bearer ")
				? req.headers.authorization?.split(" ")[1]
				: req.headers.authorization;

		if (!token) {
			throw new AppError(
				httpStatus.UNAUTHORIZED,
				"You are not logged in. Please log in to access this resource.",
			);
		}

		const verifiedToken = jwtUtils.verifyToken(token, config.jwt_access_secret);

		if (!verifiedToken.success) {
			throw new AppError(httpStatus.UNAUTHORIZED, "Invalid access token");
		}

		if (
			typeof verifiedToken.data === "string" ||
			typeof (verifiedToken.data as JwtPayload).userId !== "string"
		) {
			throw new AppError(httpStatus.UNAUTHORIZED, "Invalid access token");
		}

		const { userId } = verifiedToken.data as JwtPayload;

		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				email: true,
				name: true,
				role: true,
				status: true,
			},
		});

		if (!user?.email) {
			throw new AppError(
				httpStatus.UNAUTHORIZED,
				"User not found. Please log in again.",
			);
		}

		if (user.status === UserStatus.BLOCKED) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"Your account has been blocked. Please contact support.",
			);
		}

		if (user.status === UserStatus.DELETED) {
			throw new AppError(
				httpStatus.UNAUTHORIZED,
				"Your account is no longer available. Please log in again.",
			);
		}

		if (requiredRoles.length && !requiredRoles.includes(user.role)) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"Forbidden. You don't have permission to access this resource.",
			);
		}

		req.user = {
			email: user.email,
			name: user.name,
			userId: user.id,
			role: user.role,
		};

		next();
	});
};
