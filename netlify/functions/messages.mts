import type { Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { isAuthorized, unauthorizedResponse } from "./_shared/auth.ts";

export default async (req: Request) => {
  if (!isAuthorized(req)) return unauthorizedResponse();

  const db = getDatabase();
  const rows = await db.sql`
    SELECT role, content, created_at FROM messages ORDER BY created_at ASC
  `;

  return new Response(JSON.stringify({ messages: rows }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const config: Config = {
  path: "/api/messages",
};
