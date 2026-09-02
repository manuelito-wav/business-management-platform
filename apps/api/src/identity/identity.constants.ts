const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const ACCESS_TOKEN_TTL_MS = 15 * MINUTE_MS;
export const REFRESH_TOKEN_TTL_MS = 30 * DAY_MS;
export const PASSWORD_RESET_TOKEN_TTL_MS = HOUR_MS;

export const REFRESH_TOKEN_COOKIE_NAME = "refresh_token";

/**
 * Minimum gap between two `lastUsedAt` writes for the same session.
 * validateAccessToken runs on nearly every request; without this, "last
 * used" (session/device listing, ROADMAP.md) would mean a database write
 * on every single authenticated call instead of a periodic touch.
 */
export const SESSION_LAST_USED_TOUCH_INTERVAL_MS = 5 * MINUTE_MS;
