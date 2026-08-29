/**
 * Abstract delivery boundary for password-reset tokens (Phase 1
 * checkpoint requirement: "route password-reset delivery through an
 * abstract delivery boundary... so email, SMS, or another channel can
 * be selected later without changing core auth logic"). No concrete
 * provider is chosen yet -- see DECISIONS.md "Pending decisions" and
 * AGENT.md "When blocked": do not invent a provider, only the boundary.
 */
export interface PasswordResetDeliveryPort {
  send(email: string, resetToken: string): Promise<void>;
}

export const PASSWORD_RESET_DELIVERY = Symbol("PASSWORD_RESET_DELIVERY");

/**
 * Development-only stand-in: logs the reset token instead of sending
 * it anywhere. Refuses to run outside development so a forgotten
 * provider swap fails loudly at send time instead of silently leaking
 * reset tokens into production logs.
 */
export class LoggingPasswordResetDelivery implements PasswordResetDeliveryPort {
  async send(email: string, resetToken: string): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "LoggingPasswordResetDelivery must not be used in production. Configure a real " +
          "PASSWORD_RESET_DELIVERY provider before deploying.",
      );
    }
    console.log(`[password-reset] would deliver to ${email}: token=${resetToken}`);
  }
}
