import { ArrayUnique, IsArray, IsIn } from "class-validator";

/** SPECS.md 10.1 "Default Payment Methods". */
export const PAYMENT_METHODS = ["cash", "qr", "card", "transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export class PaymentMethodsConfig {
  @IsArray()
  @ArrayUnique()
  @IsIn(PAYMENT_METHODS, { each: true })
  enabled!: PaymentMethod[];
}

/** SPECS.md 10.1: "Default enabled methods: Cash, QR, Card, Transfer." */
export const PAYMENT_METHODS_DEFAULT: PaymentMethodsConfig = { enabled: [...PAYMENT_METHODS] };
