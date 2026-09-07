import "server-only";
import { getDb } from "../../lib/db";
import { resolveSession } from "../auth/session";
import { createChallengeApi } from "./api";
export const challengeApi=createChallengeApi({getDb,resolveUser:resolveSession});
