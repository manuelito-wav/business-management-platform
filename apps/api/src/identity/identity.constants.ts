const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const ACCESS_TOKEN_TTL_MS = 15 * MINUTE_MS;
export const REFRESH_TOKEN_TTL_MS = 30 * DAY_MS;
export const PASSWORD_RESET_TOKEN_TTL_MS = HOUR_MS;

export const REFRESH_TOKEN_COOKIE_NAME = "refresh_token";
