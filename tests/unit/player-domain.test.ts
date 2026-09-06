import { describe, expect, it } from "vitest";
import { initialFocusAllocation } from "../../src/modules/player/domain/focus";
import { isIanaTimezone } from "../../src/modules/player/domain/timezone";
import { focusSchema, onboardingSchema } from "../../src/modules/player/domain/input";
import { requireAdmin, requireAuthenticatedUser, requireCompletedOnboardingPlayer, type Principal } from "../../src/modules/auth/guards";
import { normalizeEmail } from "../../src/modules/auth/adapter";
import { oauthConfigurationStatus } from "../../src/config/env";

const focus = () => Object.entries(initialFocusAllocation()).map(([skillCode, points]) => ({ skillCode, points }));
describe("Phase 03 domain boundaries", () => {
  it("provides the deterministic balanced starting allocation", () => {
    expect(initialFocusAllocation()).toEqual({ F: 6, L: 6, O: 6, U: 6, R: 6, I: 6, S: 5, H: 5 });
  });
  it.each(["America/Denver", "America/New_York", "Europe/London", "UTC"])("accepts %s", (zone) => expect(isIanaTimezone(zone)).toBe(true));
  it.each(["Mountain Time", "Denver", "UTC-7", "+01:00", "", " Europe/London", "Etc/Imaginary"])("rejects %s", (zone) => expect(isIanaTimezone(zone)).toBe(false));
  it("validates allocation and rejects duplicates before converting to a map", () => {
    expect(() => focusSchema.parse({ focus: focus() })).not.toThrow();
    expect(() => focusSchema.parse({ focus: [...focus(), focus()[0]] })).toThrow(/exactly once/);
  });
  it.each([0, 11, 5.5, 7])("rejects invalid points or total: %s", (points) => {
    const rows = focus(); rows[0].points = points;
    expect(() => focusSchema.parse({ focus: rows })).toThrow();
  });
  it("rejects missing, unknown Skills and identity or role fields", () => {
    expect(() => focusSchema.parse({ focus: focus().slice(1) })).toThrow();
    expect(() => focusSchema.parse({ focus: focus().map((r, i) => i ? r : { ...r, skillCode: "X" }) })).toThrow();
    expect(() => onboardingSchema.parse({ focus: focus(), timezone: "UTC", role: "ADMIN", playerId: "other" })).toThrow();
  });
  it("normalizes email without inventing Gmail dot or plus merging", () => expect(normalizeEmail(" User.Name+Tag@Gmail.com ")).toBe("user.name+tag@gmail.com"));
  it("guards authentication, onboarding, and admin role independently", () => {
    const user: Principal = { id: "user", email: "user@example.test", role: "PLAYER", playerId: "player", onboardingCompletedAt: null };
    expect(() => requireAuthenticatedUser(null)).toThrow("Sign in");
    expect(() => requireCompletedOnboardingPlayer(user)).toThrow("Complete onboarding");
    expect(() => requireAdmin(user)).toThrow("Administrator");
    expect(requireAdmin({ ...user, role: "ADMIN" }).id).toBe("user");
    expect(requireCompletedOnboardingPlayer({ ...user, onboardingCompletedAt: "2026-09-06T00:00:00Z" }).playerId).toBe("player");
  });
  it("fails closed when OAuth environment is missing or malformed", () => {
    expect(oauthConfigurationStatus({ NODE_ENV: "test" }).ready).toBe(false);
    expect(oauthConfigurationStatus({ NODE_ENV: "test", DATABASE_URL: "bad", AUTH_SECRET: "short", AUTH_GOOGLE_ID: "x", AUTH_GOOGLE_SECRET: "x" }).ready).toBe(false);
  });
});
