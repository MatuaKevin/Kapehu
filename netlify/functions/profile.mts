import type { Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { isAuthorized, unauthorizedResponse } from "./_shared/auth.ts";

const MAX_NOTES_LENGTH = 4000;

export default async (req: Request) => {
  if (!isAuthorized(req)) return unauthorizedResponse();

  const db = getDatabase();

  if (req.method === "GET") {
    const [row] = await db.sql`SELECT notes FROM profile WHERE id = 1`;
    return new Response(JSON.stringify({ notes: row?.notes ?? "" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "PUT") {
    const body = (await req.json().catch(() => null)) as { notes?: unknown } | null;
    if (typeof body?.notes !== "string") {
      return new Response(JSON.stringify({ error: "notes must be a string" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const notes = body.notes.slice(0, MAX_NOTES_LENGTH);
    await db.sql`
      UPDATE profile SET notes = ${notes}, updated_at = NOW() WHERE id = 1
    `;
    return new Response(JSON.stringify({ notes }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/profile",
};
