import { recommendationApi } from "@/modules/recommendations/server-api";
export const dynamic = "force-dynamic";
export const GET = recommendationApi.get;
export const POST = recommendationApi.refresh;
