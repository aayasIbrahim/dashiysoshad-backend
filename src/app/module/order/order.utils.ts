import  httpStatus  from 'http-status';
import { Prisma, Role } from "../../../generated/prisma/client";
import config from "../../config";
import { AppError } from '../../utils/AppError';
import { RequestUser } from '../../middleware/checkAuth';
import { BkashPaymentResult } from '../../lib/bkash';

export const orderInclude = {
    user: {
        select: {
            id: true,
            name: true,
            email: true,
        },
    },
    orderItems: {
        include: {
            product: {
                select: {
                    id: true,
                    name: true,
                    sku: true,
                    images: true,
                },
            },
        },
    },
} as const;

export const maximumMoneyValue = new Prisma.Decimal("9999999999.99");
export const defaultShippingFee = new Prisma.Decimal(config.order_shipping_fee);

if (
    !defaultShippingFee.isFinite() ||
    defaultShippingFee.isNegative() ||
    defaultShippingFee.decimalPlaces() > 2 ||
    defaultShippingFee.greaterThan(maximumMoneyValue)
) {
    throw new Error(
        "ORDER_SHIPPING_FEE must be a non-negative amount with up to 2 decimals",
    );
}

export const normalizePhone = (phone: string) => phone.replace(/\D/g, "");

export const ensureMoneyRange = (amount: Prisma.Decimal, field: string) => {
    if (
        !amount.isFinite() ||
        amount.isNegative() ||
        amount.greaterThan(maximumMoneyValue)
    ) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            `${field} is outside the supported range`,
        );
    }
};
export const canAccessOrderPayment = (
    order: { userId: string | null; customerPhone: string },
    actor?: RequestUser,
    phone?: string,
) => {
    const isStaff =
        actor?.role === Role.SUPER_ADMIN ||
        actor?.role === Role.ADMIN ||
        actor?.role === Role.STAFF;

    if (isStaff) {
        return;
    }

    if (order.userId) {
        if (!actor || actor.userId !== order.userId) {
            throw new AppError(httpStatus.FORBIDDEN, "You cannot access this order");
        }
        return;
    }

    if (!phone || normalizePhone(phone) !== order.customerPhone) {
        throw new AppError(
            httpStatus.FORBIDDEN,
            "Provide the phone number used for this guest order",
        );
    }
};

export const verifyBkashResult = (
    payment: {
        bkashPaymentId: string | null;
        merchantInvoiceNumber: string;
        amount: Prisma.Decimal;
        currency: string;
    },
    result: BkashPaymentResult,
) => {
    let amountMatches = false;
    if (typeof result.amount === "string" || typeof result.amount === "number") {
        try {
            amountMatches = new Prisma.Decimal(String(result.amount)).equals(
                payment.amount,
            );
        } catch {
            amountMatches = false;
        }
    }

    if (
        result.transactionStatus !== "Completed" ||
        (result.paymentID !== undefined &&
            result.paymentID !== payment.bkashPaymentId) ||
        (result.merchantInvoiceNumber !== undefined &&
            result.merchantInvoiceNumber !== payment.merchantInvoiceNumber) ||
        result.currency !== payment.currency ||
        !amountMatches ||
        typeof result.trxID !== "string" ||
        !result.trxID
    ) {
        throw new AppError(
            httpStatus.BAD_GATEWAY,
            "bKash payment verification failed",
        );
    }
};

export const getBkashPaidAt = (
    result: BkashPaymentResult,
    paymentCreatedAt: Date,
    verifiedAt = new Date(),
): { paidAt: Date; source: "BKASH" | "VERIFIED_AT" } => {
    if (
        typeof result.paymentExecuteTime !== "string" ||
        result.paymentExecuteTime.length > 64
    ) {
        return { paidAt: verifiedAt, source: "VERIFIED_AT" };
    }

    const normalizedTimestamp = result.paymentExecuteTime
        .trim()
        .replace(/(\d{2}:\d{2}:\d{2}):(\d{3})\s+GMT([+-]\d{4})$/, "$1.$2$3");
    const gatewayPaidAt = new Date(normalizedTimestamp);
    const gatewayPaidAtMs = gatewayPaidAt.getTime();
    const allowedClockSkewMs = 5 * 60 * 1000;

    if (
        !Number.isFinite(gatewayPaidAtMs) ||
        gatewayPaidAtMs < paymentCreatedAt.getTime() - allowedClockSkewMs ||
        gatewayPaidAtMs > verifiedAt.getTime() + allowedClockSkewMs
    ) {
        return { paidAt: verifiedAt, source: "VERIFIED_AT" };
    }

    return { paidAt: gatewayPaidAt, source: "BKASH" };
};