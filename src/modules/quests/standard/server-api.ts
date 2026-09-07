import "server-only";
import { getDb } from "../../../lib/db";
import { resolveSession } from "../../auth/session";
import { createStandardApi } from "./api";
export const standardApi = createStandardApi({ getDb, resolveUser: resolveSession });
