import { IsInt } from "class-validator";

export class AdjustStockDto {
  /** Signed correction; InventoryService rejects zero. */
  @IsInt()
  quantity!: number;
}
