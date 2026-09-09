import "server-only";
import { getDb } from "../../lib/db";
import { resolveSession } from "../auth/session";
import { createAdminApi } from "./api";
export const adminApi = createAdminApi({ getDb, resolveUser: resolveSession });
