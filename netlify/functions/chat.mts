import type { Config } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";
import { getDatabase } from "@netlify/database";
import { isAuthorized, unauthorizedResponse } from "./_shared/auth.ts";
import { KAPEHU_MODEL, KAPEHU_SYSTEM_PROMPT, type ChatMessage } from "./_shared/kapehu.ts";

const client = new Anthropic();

export default async (req: Request) => {
  if (!isAuthorized(req)) return unauthorizedResponse();

  const body = (await req.json().catch(() => null)) as { message?: unknown } | null;
  const userMessage = typeof body?.message === "string" ? body.message.trim() : "";
  if (!userMessage) {
    return new Response(JSON.stringify({ error: "message must be a non-empty string" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDatabase();
  const historyRows = await db.sql`SELECT role, content FROM messages ORDER BY created_at ASC`;
  const history = historyRows as unknown as ChatMessage[];

  await db.sql`INSERT INTO messages (role, content) VALUES (${"user"}, ${userMessage})`;

  const encoder = new TextEncoder();
  let assistantText = "";

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const claudeStream = client.messages.stream({
          model: KAPEHU_MODEL,
          max_tokens: 4096,
          system: KAPEHU_SYSTEM_PROMPT,
          messages: [...history, { role: "user", content: userMessage }],
        });

        for await (const event of claudeStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            assistantText += event.delta.text;
            send("delta", { text: event.delta.text });
          }
        }

        await claudeStream.finalMessage();

        if (assistantText) {
          await db.sql`INSERT INTO messages (role, content) VALUES (${"assistant"}, ${assistantText})`;
        }

        send("done", {});
      } catch (error) {
        if (error instanceof Anthropic.AuthenticationError) {
          send("error", { message: "The server's Anthropic API key is missing or invalid." });
        } else if (error instanceof Anthropic.RateLimitError) {
          send("error", {
            message: "Kapehu is getting a lot of requests right now — try again shortly.",
          });
        } else if (error instanceof Anthropic.APIError) {
          send("error", { message: `Kapehu hit an API error: ${error.message}` });
        } else {
          send("error", { message: "Something went wrong reaching Kapehu." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
};

export const config: Config = {
  path: "/api/chat",
};
