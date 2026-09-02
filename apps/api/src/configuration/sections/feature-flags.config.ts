import { IsBoolean } from "class-validator";

/**
 * SPECS.md 19.1 "Configurable Features" examples, plus productImages
 * (D-020/SPECS.md 6.3: images are optional -- the catalog stays fully
 * searchable without them). All default to false; each flag becomes
 * meaningful once its feature actually ships (productImages: once a real
 * object-storage upload flow exists -- see schema.prisma Product's doc
 * comment for why that is not built yet).
 */
export class FeatureFlagsConfig {
  @IsBoolean()
  expirationTracking!: boolean;

  @IsBoolean()
  currentAccounts!: boolean;

  @IsBoolean()
  priceLists!: boolean;

  @IsBoolean()
  scheduledReports!: boolean;

  @IsBoolean()
  productImages!: boolean;
}

export const FEATURE_FLAGS_DEFAULT: FeatureFlagsConfig = {
  expirationTracking: false,
  currentAccounts: false,
  priceLists: false,
  scheduledReports: false,
  productImages: false,
};
