import { adminApi } from "@/modules/admin/server-api";
export async function POST(request: Request, context: RouteContext<"/api/admin/quests/[id]/transition">) { return adminApi.transition(request, (await context.params).id); }
