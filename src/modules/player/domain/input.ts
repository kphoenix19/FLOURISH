import { z } from "zod";
import { validateFocusAllocation } from "./focus";
import { isIanaTimezone } from "./timezone";

// Arrays preserve duplicate entries so the server can reject them explicitly.
export const focusRowsSchema = z.array(z.strictObject({ skillCode: z.string(), points: z.number() })).superRefine((rows, ctx) => {
  if (new Set(rows.map((r) => r.skillCode)).size !== rows.length) ctx.addIssue({ code: "custom", message: "Each Skill must appear exactly once." });
  const result = validateFocusAllocation(Object.fromEntries(rows.map((r) => [r.skillCode, r.points])));
  if (!result.success) for (const message of result.errors) ctx.addIssue({ code: "custom", message });
});
export const timezoneSchema = z.string().refine(isIanaTimezone, "Choose a valid IANA timezone, such as America/Denver.");
export const onboardingSchema = z.strictObject({ timezone: timezoneSchema, focus: focusRowsSchema });
export const focusSchema = z.strictObject({ focus: focusRowsSchema });
export const timezoneUpdateSchema = z.strictObject({ timezone: timezoneSchema });
