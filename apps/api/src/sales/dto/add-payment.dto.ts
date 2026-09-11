import { IsIn, IsInt, Min } from "class-validator";
import { PAYMENT_METHODS } from "../../configuration/sections/payment-methods.config";

export class AddPaymentDto {
  @IsIn(PAYMENT_METHODS)
  method!: (typeof PAYMENT_METHODS)[number];

  /** Integer ARS minor units (D-005) -- for "cash" the amount tendered, otherwise the exact amount charged (see the Payment model's own doc comment). */
  @IsInt()
  @Min(1)
  amount!: number;
}
