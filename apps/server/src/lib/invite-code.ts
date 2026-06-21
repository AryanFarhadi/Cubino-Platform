import { sql } from "drizzle-orm";
import { invites } from "../db/schema.js";

/** Case-insensitive invite lookup (nanoid codes are case-sensitive in DB). */
export function inviteCodeMatches(code: string) {
  const normalized = code.trim();
  return sql`lower(${invites.code}) = lower(${normalized})`;
}
