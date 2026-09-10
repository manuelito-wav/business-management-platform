import { Type } from "class-transformer";
import { IsIn, IsOptional, ValidateNested } from "class-validator";
import { IANA_TIMEZONES } from "../../common/iana-timezones";
import { ExpirationPolicyConfig } from "../sections/expiration-policy.config";
import { FeatureFlagsConfig } from "../sections/feature-flags.config";
import { PaymentMethodsConfig } from "../sections/payment-methods.config";
import { PoliciesConfig } from "../sections/policies.config";
import { RegisterPolicyConfig } from "../sections/register-policy.config";

export class UpdateConfigurationDto {
  /** D-035: per-business configuration value, not a permanent constant. */
  @IsOptional()
  @IsIn(IANA_TIMEZONES)
  businessTimezone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentMethodsConfig)
  paymentMethods?: PaymentMethodsConfig;

  @IsOptional()
  @ValidateNested()
  @Type(() => FeatureFlagsConfig)
  featureFlags?: FeatureFlagsConfig;

  @IsOptional()
  @ValidateNested()
  @Type(() => PoliciesConfig)
  policies?: PoliciesConfig;

  @IsOptional()
  @ValidateNested()
  @Type(() => RegisterPolicyConfig)
  registerPolicy?: RegisterPolicyConfig;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExpirationPolicyConfig)
  expirationPolicy?: ExpirationPolicyConfig;
}
