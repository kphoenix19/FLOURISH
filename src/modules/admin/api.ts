import type { PrismaClient } from "../../generated/prisma/client";
import { payload, respond } from "../../lib/api";
import { requireAdmin, type Principal } from "../auth/guards";
import { adminReferenceData, createQuest, getQuest, listQuests, transitionQuest, updateQuest } from "./service";

export function createAdminApi(deps: { getDb: () => PrismaClient; resolveUser: () => Promise<Principal | null> }) {
  const admin = async () => requireAdmin(await deps.resolveUser());
  return {
    references: () => respond(async () => { await admin(); return adminReferenceData(deps.getDb()); }),
    list: (request: Request) => respond(async () => { await admin(); return listQuests(deps.getDb(), Object.fromEntries(new URL(request.url).searchParams)); }),
    create: (request: Request) => respond(async () => { const user = await admin(); return createQuest(deps.getDb(), user.id, await payload(request)); }),
    get: (_request: Request, id: string) => respond(async () => { await admin(); return getQuest(deps.getDb(), id); }),
    update: (request: Request, id: string) => respond(async () => { const user = await admin(); return updateQuest(deps.getDb(), user.id, id, await payload(request)); }),
    transition: (request: Request, id: string) => respond(async () => { const user = await admin(); return transitionQuest(deps.getDb(), user.id, id, await payload(request)); }),
  };
}
