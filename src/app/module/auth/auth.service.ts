import bcrypt from "bcryptjs";
import type { JwtPayload } from "jsonwebtoken";
import httpStatus from "http-status";
import { UserStatus } from "../../../generated/prisma/enums";

import { prisma } from "../../lib/prisma";
import config from "../../config";
import { AppError } from "../../utils/AppError";
import { jwtUtils } from "../../utils/jwt";
import type {
	ILoginUserPayload,
	IRegisterPayload,
	IRequestUser,
} from "./auth.interface";
import { createTokenPair, getBcryptSaltRounds } from "./auth.utils";

const registerUser = async (payload: IRegisterPayload) => {
	const email = payload.email.trim().toLowerCase();
	const phone = payload.phone.trim();
	const existingUser = await prisma.user.findFirst({
		where: { OR: [{ email }, { phone }] },
		select: { id: true },
	});

	if (existingUser) {
		throw new AppError(
			httpStatus.CONFLICT,
			"An account with this email or phone number already exists",
		);
	}

	const password = await bcrypt.hash(payload.password, getBcryptSaltRounds());

	return await prisma.user.create({
		data: {
			name: payload.name.trim(),
			email,
			phone,
			password,
		},
		select: {
			id: true,
			name: true,
			email: true,
			phone: true,
			role: true,
			status: true,
			createdAt: true,
		},
	});
};

const loginUser = async (payload: ILoginUserPayload) => {
	const email = payload.email.trim().toLowerCase();
	const user = await prisma.user.findUnique({
		where: { email },
		select: {
			id: true,
			name: true,
			email: true,
			phone: true,
			password: true,
			role: true,
			status: true,
			createdAt: true,
			updatedAt: true,
		},
	});

	if (
		!user?.email ||
		!user.password ||
		!(await bcrypt.compare(payload.password, user.password))
	) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");
	}

	if (user.status !== UserStatus.ACTIVE) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Your account is not active. Please contact support.",
		);
	}

	const { accessToken, refreshToken } = createTokenPair(user);
	const { password: _password, ...safeUser } = user;

	return { accessToken, refreshToken, user: safeUser };
};

const getMe = async (user: IRequestUser) => {
	const existingUser = await prisma.user.findUnique({
		where: { id: user.userId },
		omit: { password: true },
	});

	if (!existingUser || existingUser.status !== UserStatus.ACTIVE) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Your account is not active. Please contact support.",
		);
	}

	return existingUser;
};

const refreshToken = async (token: string) => {
	const verifiedRefreshToken = jwtUtils.verifyToken(
		token,
		config.jwt_refresh_secret,
	);

	if (
		!verifiedRefreshToken.success ||
		!verifiedRefreshToken.data ||
		typeof verifiedRefreshToken.data === "string"
	) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid refresh token");
	}

	const { userId } = verifiedRefreshToken.data as JwtPayload;

	if (typeof userId !== "string") {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid refresh token");
	}

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			email: true,
			role: true,
			status: true,
		},
	});

	if (!user?.email || user.status !== UserStatus.ACTIVE) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"Your account is not active or no longer exists",
		);
	}

	return createTokenPair(user);
};

export const AuthService = {
	registerUser,
	loginUser,
	getMe,
	refreshToken,
};
