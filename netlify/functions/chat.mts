import type { Config } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";
import { getDatabase } from "@netlify/database";
import { isAuthorized, unauthorizedResponse } from "./_shared/auth.ts";
import {
  KAPEHU_MODEL,
  SUPPORTED_IMAGE_TYPES,
  buildSystemPrompt,
  rowToClaudeMessage,
  type ClaudeContentBlock,
  type StoredMessageRow,
  type SupportedImageType,
} from "./_shared/kapehu.ts";

const client = new Anthropic();

interface IncomingImage {
  mediaType: SupportedImageType;
  base64: string;
}

function parseImage(value: unknown): IncomingImage | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.mediaType !== "string" || typeof v.base64 !== "string") return null;
  if (!(SUPPORTED_IMAGE_TYPES as Set<string>).has(v.mediaType)) return null;
  return { mediaType: v.mediaType as SupportedImageType, base64: v.base64 };
}

export default async (req: Request) => {
  if (!isAuthorized(req)) return unauthorizedResponse();

  const body = (await req.json().catch(() => null)) as { message?: unknown; image?: unknown } | null;
  const userText = typeof body?.message === "string" ? body.message.trim() : "";
  const image = parseImage(body?.image);

  if (!userText && !image) {
    return new Response(JSON.stringify({ error: "message or image is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDatabase();
  const [historyRows, profileRows] = await Promise.all([
    db.sql`
      SELECT role, content, image_media_type, image_base64
      FROM messages ORDER BY created_at ASC
    `,
    db.sql`SELECT notes FROM profile WHERE id = 1`,
  ]);
  const history = (historyRows as unknown as StoredMessageRow[]).map(rowToClaudeMessage);
  const systemPrompt = buildSystemPrompt((profileRows[0]?.notes as string | undefined) ?? "");

  await db.sql`
    INSERT INTO messages (role, content, image_media_type, image_base64)
    VALUES (${"user"}, ${userText}, ${image?.mediaType ?? null}, ${image?.base64 ?? null})
  `;

  const newBlocks: ClaudeContentBlock[] = [];
  if (image) {
    newBlocks.push({
      type: "image",
      source: { type: "base64", media_type: image.mediaType, data: image.base64 },
    });
  }
  if (userText) newBlocks.push({ type: "text", text: userText });

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
          system: systemPrompt,
          messages: [...history, { role: "user", content: newBlocks }],
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
