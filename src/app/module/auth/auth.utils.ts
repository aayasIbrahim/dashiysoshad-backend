import { Response } from "express";


import { SignOptions } from "jsonwebtoken";
import config from "../../config";
import { jwtUtils } from "../../utils/jwt";

export const authCookieOptions = {
  httpOnly: true,
  secure: config.node_env !== "development",
  sameSite:
    config.node_env === "development" ? ("lax" as const) : ("none" as const),
};
export const setAuthCookies = (
	res: Response,
	accessToken: string,
	refreshToken: string,
) => {
	res.cookie("accessToken", accessToken, {
		...authCookieOptions,
		maxAge: 1000 * 60 * 60 * 24,
	});
	res.cookie("refreshToken", refreshToken, {
		...authCookieOptions,
		maxAge: 1000 * 60 * 60 * 24 * 7,
	});
};
export const createTokenPair = (user: { id: string }) => {
    const payload = { userId: user.id };
    const accessToken = jwtUtils.createToken(
        payload,
        config.jwt_access_secret,
        config.jwt_access_expires_in as SignOptions["expiresIn"],
    );
    const refreshToken = jwtUtils.createToken(
        payload,
        config.jwt_refresh_secret,
        config.jwt_refresh_expires_in as SignOptions["expiresIn"],
    );

    return { accessToken, refreshToken };
};
export const getBcryptSaltRounds = () => {
	const saltRounds = Number(config.bcrypt_salt_rounds ?? 12);

	if (!Number.isInteger(saltRounds) || saltRounds < 10 || saltRounds > 15) {
		throw new Error("BCRYPT_SALT_ROUNDS must be an integer between 10 and 15");
	}

	return saltRounds;
};
