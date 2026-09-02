import { IsBoolean } from "class-validator";

/**
 * SPECS.md 19.1 "Configurable Features" examples. All default to false --
 * none of these modules are implemented yet, so enabling one now would
 * have no effect; each flag becomes meaningful once its module ships.
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
}

export const FEATURE_FLAGS_DEFAULT: FeatureFlagsConfig = {
  expirationTracking: false,
  currentAccounts: false,
  priceLists: false,
  scheduledReports: false,
};
