export function isIanaTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 100 || value.trim() !== value || /^[+-]/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch { return false; }
}
