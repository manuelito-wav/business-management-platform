/**
 * The runtime's own IANA timezone database (Node/V8 `Intl`), used to
 * validate `businessTimezone` (D-035) against real identifiers instead of
 * maintaining a separate hand-written list that could drift out of date.
 */
export const IANA_TIMEZONES: readonly string[] = Intl.supportedValuesOf("timeZone");
