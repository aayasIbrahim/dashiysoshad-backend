import httpStatus from "http-status";
import config from "../config";
import { AppError } from "../utils/AppError";

const TOKEN_REFRESH_THRESHOLD_SECONDS = 600;
const DEFAULT_ID_TOKEN_LIFETIME_SECONDS = 60 * 60;
const DEFAULT_REFRESH_TOKEN_LIFETIME_SECONDS = 60 * 60 * 24 * 28;

type BkashTokenResponse = {
	id_token?: unknown;
	refresh_token?: unknown;
	expires_in?: unknown;
	refresh_token_expires_in?: unknown;
};

type BkashTokenCache = {
	idToken: string;
	idTokenExpiresAt: number;
	refreshToken?: string;
	refreshTokenExpiresAt?: number;
};

export type BkashPaymentResult = {
	paymentID?: unknown;
	bkashURL?: unknown;
	statusCode?: unknown;
	statusMessage?: unknown;
	transactionStatus?: unknown;
	trxID?: unknown;
	paymentExecuteTime?: unknown;
	amount?: unknown;
	currency?: unknown;
	merchantInvoiceNumber?: unknown;
	[key: string]: unknown;
};

let tokenCache: BkashTokenCache | undefined;
let tokenRequest: Promise<string> | undefined;

const getLifetimeSeconds = (value: unknown, fallback: number): number =>
	typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: fallback;

const requestToken = async (
	endpoint: string,
	body: Record<string, string>,
): Promise<BkashTokenResponse> => {
	const response = await fetch(`${config.bkash_base_url}${endpoint}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
			username: config.bkash_username,
			password: config.bkash_password,
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		throw new AppError(httpStatus.BAD_GATEWAY, "Bkash Access Token Grant Failed");
	}

	return (await response.json()) as BkashTokenResponse;
};

const fetchBkashIdToken = async (): Promise<string> => {
	const now = Date.now();
	if (
		tokenCache?.refreshToken &&
		tokenCache.refreshTokenExpiresAt !== undefined &&
		tokenCache.refreshTokenExpiresAt - now >
			TOKEN_REFRESH_THRESHOLD_SECONDS * 1000
	) {
		const result = await requestToken(
			"/tokenized/checkout/token/refresh",
			{
				app_key: config.bkash_app_key,
				app_secret: config.bkash_app_secret,
				refresh_token: tokenCache.refreshToken,
			},
		);

		if (typeof result.id_token !== "string" || !result.id_token) {
			throw new AppError(
				httpStatus.BAD_GATEWAY,
				"Invalid bKash access token response",
			);
		}

		const refreshToken =
			typeof result.refresh_token === "string" && result.refresh_token
				? result.refresh_token
				: tokenCache?.refreshToken;
		const refreshTokenLifetime = getLifetimeSeconds(
			result.refresh_token_expires_in,
			DEFAULT_REFRESH_TOKEN_LIFETIME_SECONDS,
		);

		tokenCache = {
			idToken: result.id_token,
			idTokenExpiresAt:
				Date.now() +
				getLifetimeSeconds(
					result.expires_in,
					DEFAULT_ID_TOKEN_LIFETIME_SECONDS,
				) *
					1000,
			refreshToken,
			refreshTokenExpiresAt:
				Date.now() + refreshTokenLifetime * 1000,
		};

		return tokenCache.idToken;
	}

	const result = await requestToken("/tokenized/checkout/token/grant", {
		app_key: config.bkash_app_key,
		app_secret: config.bkash_app_secret,
	});

	if (typeof result.id_token !== "string" || !result.id_token) {
		throw new AppError(
			httpStatus.BAD_GATEWAY,
			"Invalid bKash access token response",
		);
	}

	const refreshToken =
		typeof result.refresh_token === "string" && result.refresh_token
			? result.refresh_token
			: undefined;

	tokenCache = {
		idToken: result.id_token,
		idTokenExpiresAt:
			Date.now() +
			getLifetimeSeconds(result.expires_in, DEFAULT_ID_TOKEN_LIFETIME_SECONDS) *
				1000,
		refreshToken,
		refreshTokenExpiresAt: refreshToken
			? Date.now() +
				getLifetimeSeconds(
					result.refresh_token_expires_in,
					DEFAULT_REFRESH_TOKEN_LIFETIME_SECONDS,
				) *
					1000
			: undefined,
	};

	return tokenCache.idToken;
};

const requestPayment = async (
	endpoint: string,
	method: "GET" | "POST",
	body?: Record<string, string>,
): Promise<BkashPaymentResult> => {
	const idToken = await getBkashIdToken();
	const response = await fetch(`${config.bkash_base_url}${endpoint}`, {
		method,
		headers: {
			Accept: "application/json",
			Authorization: idToken,
			"X-APP-Key": config.bkash_app_key,
			...(body ? { "Content-Type": "application/json" } : {}),
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	});

	let result: BkashPaymentResult;
	try {
		result = (await response.json()) as BkashPaymentResult;
	} catch {
		throw new AppError(httpStatus.BAD_GATEWAY, "Invalid response from bKash");
	}

	if (
		!response.ok ||
		(result.statusCode !== undefined && result.statusCode !== "0000")
	) {
		throw new AppError(
			httpStatus.BAD_GATEWAY,
			typeof result.statusMessage === "string"
				? result.statusMessage
				: "bKash payment request failed",
		);
	}

	return result;
};

export const createBkashPayment = async (input: {
	amount: string;
	payerReference: string;
	merchantInvoiceNumber: string;
}): Promise<BkashPaymentResult> => {
	if (!config.bkash_callback_url) {
		throw new AppError(
			httpStatus.INTERNAL_SERVER_ERROR,
			"BKASH_CALLBACK_URL must be configured",
		);
	}

	return requestPayment("/tokenized/checkout/create", "POST", {
		mode: "0011",
		payerReference: input.payerReference,
		callbackURL: config.bkash_callback_url,
		amount: input.amount,
		currency: "BDT",
		intent: "sale",
		merchantInvoiceNumber: input.merchantInvoiceNumber,
	});
};

export const executeBkashPayment = async (
	paymentId: string,
): Promise<BkashPaymentResult> =>
	requestPayment(
		`/tokenized/checkout/execute/${encodeURIComponent(paymentId)}`,
		"POST",
	);

export const queryBkashPayment = async (
	paymentId: string,
): Promise<BkashPaymentResult> =>
	requestPayment(
		`/tokenized/checkout/payment/status?paymentID=${encodeURIComponent(paymentId)}`,
		"GET",
	);

export const getBkashIdToken = async (): Promise<string> => {
	if (
		tokenCache &&
		tokenCache.idTokenExpiresAt - Date.now() >
			TOKEN_REFRESH_THRESHOLD_SECONDS * 1000
	) {
		return tokenCache.idToken;
	}

	if (!tokenRequest) {
		tokenRequest = fetchBkashIdToken();
	}

	try {
		return await tokenRequest;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}
		const message =
			error instanceof Error ? error.message : "Unknown bKash token error";
		throw new AppError(httpStatus.BAD_GATEWAY, message);
	} finally {
		tokenRequest = undefined;
	}
};
