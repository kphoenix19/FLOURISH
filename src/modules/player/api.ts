import type { PrismaClient } from "../../generated/prisma/client";
import { ZodError } from "zod";
import { ServiceError } from "../../lib/service-error";
import { requireAdmin, requireAuthenticatedUser, requireCompletedOnboardingPlayer, requirePlayer, type Principal } from "../auth/guards";
import { completeOnboarding, playerSummary, respecFocus, updateTimezone } from "./services";

export function createPlayerApi(deps: { getDb: () => PrismaClient; resolveUser: () => Promise<Principal | null> }) {
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  async function respond(action: () => Promise<unknown>) {
    try { return json(await action()); } catch (error) {
      if (error instanceof ZodError) return json({ error: { code: "VALIDATION", message: error.issues.map((i) => i.message).join(" ") } }, 400);
      if (error instanceof SyntaxError) return json({ error: { code: "INVALID_JSON", message: "Send a valid JSON request." } }, 400);
      if (error instanceof ServiceError) return json({ error: { code: error.code, message: error.message } }, error.status);
      if (typeof error === "object" && error && "code" in error && ["P2002", "P2034"].includes(String(error.code))) return json({ error: { code: "CONFLICT", message: "A concurrent change occurred. Please retry." } }, 409);
      return json({ error: { code: "UNEXPECTED", message: "The request could not be completed. Please try again." } }, 500);
    }
  }
  async function payload(request: Request) {
    // Cookie-authenticated REST mutations require same-origin JSON requests.
    const origin = request.headers.get("origin");
    const expected = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).origin : new URL(request.url).origin;
    if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") throw new ServiceError(403, "ORIGIN", "A same-origin request is required.");
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ServiceError(415, "CONTENT_TYPE", "Send application/json.");
    const body = await request.text();
    if (body.length > 16_384) throw new ServiceError(413, "PAYLOAD_TOO_LARGE", "Request is too large.");
    return JSON.parse(body) as unknown;
  }
  return {
    me: () => respond(async () => { const user = requireAuthenticatedUser(await deps.resolveUser()); return playerSummary(deps.getDb(), user.id); }),
    complete: (req: Request) => respond(async () => { const user = requirePlayer(await deps.resolveUser()); return completeOnboarding(deps.getDb(), user.id, await payload(req)); }),
    focus: (req: Request) => respond(async () => { const user = requireCompletedOnboardingPlayer(await deps.resolveUser()); return respecFocus(deps.getDb(), user.id, await payload(req)); }),
    timezone: (req: Request) => respond(async () => { const user = requireCompletedOnboardingPlayer(await deps.resolveUser()); return updateTimezone(deps.getDb(), user.id, await payload(req)); }),
    admin: () => respond(async () => { requireAdmin(await deps.resolveUser()); return { authorized: true }; }),
  };
}
