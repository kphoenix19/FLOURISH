import { adminApi } from "@/modules/admin/server-api";
export async function GET(request: Request, context: RouteContext<"/api/admin/quests/[id]">) { return adminApi.get(request, (await context.params).id); }
export async function PUT(request: Request, context: RouteContext<"/api/admin/quests/[id]">) { return adminApi.update(request, (await context.params).id); }
