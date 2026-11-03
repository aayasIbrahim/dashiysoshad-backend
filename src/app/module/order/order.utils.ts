import  httpStatus  from 'http-status';
import { Prisma } from "../../../generated/prisma/client";
import config from "../../config";
import { AppError } from '../../utils/AppError';

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