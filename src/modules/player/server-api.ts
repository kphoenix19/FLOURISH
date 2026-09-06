import "server-only";
import { getDb } from "../../lib/db";
import { resolveSession } from "../auth/session";
import { createPlayerApi } from "./api";
export const playerApi = createPlayerApi({ getDb, resolveUser: resolveSession });
