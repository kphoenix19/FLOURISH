import "server-only";
import { getDb } from "../../lib/db";
import { resolveSession } from "../auth/session";
import { createRecommendationApi } from "./api";
export const recommendationApi = createRecommendationApi({ getDb, resolveUser: resolveSession });
