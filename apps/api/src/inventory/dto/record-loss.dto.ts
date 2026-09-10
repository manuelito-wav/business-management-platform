import { IsIn, IsInt, Min } from "class-validator";

export const INVENTORY_LOSS_REASONS = ["theft", "damage", "expiration", "other"] as const;

export class RecordLossDto {
  /** How many units/grams were lost (D-008) -- always positive; InventoryService stores it as a negative movement. */
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsIn(INVENTORY_LOSS_REASONS)
  lossReason!: (typeof INVENTORY_LOSS_REASONS)[number];
}
