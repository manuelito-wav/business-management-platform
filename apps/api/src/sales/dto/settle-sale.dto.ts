import { IsString, MinLength } from "class-validator";

/** ARCHITECTURE.md "Command envelope": the client generates this once (D-033: before the operation is even attempted) and resends the same value on any retry, so SalesService.settle can recognize "I already processed this" and return the same result instead of erroring or double-settling. */
export class SettleSaleDto {
  @IsString()
  @MinLength(1)
  operationId!: string;
}
