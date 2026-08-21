import "dotenv/config";
import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import { KAPEHU_MODEL, KAPEHU_SYSTEM_PROMPT, type ChatMessage } from "./kapehu.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const client = new Anthropic();

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (v.role === "user" || v.role === "assistant") && typeof v.content === "string";
}

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body as { messages?: unknown };

  if (!Array.isArray(messages) || messages.length === 0 || !messages.every(isChatMessage)) {
    res.status(400).json({ error: "messages must be a non-empty array of { role, content }" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const stream = client.messages.stream({
      model: KAPEHU_MODEL,
      max_tokens: 4096,
      system: KAPEHU_SYSTEM_PROMPT,
      messages: messages as ChatMessage[],
    });

    stream.on("text", (delta) => {
      send("delta", { text: delta });
    });

    await stream.finalMessage();
    send("done", {});
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      send("error", { message: "The server's Anthropic API key is missing or invalid." });
    } else if (error instanceof Anthropic.RateLimitError) {
      send("error", { message: "Kapehu is getting a lot of requests right now — try again shortly." });
    } else if (error instanceof Anthropic.APIError) {
      send("error", { message: `Kapehu hit an API error: ${error.message}` });
    } else {
      send("error", { message: "Something went wrong reaching Kapehu." });
    }
  } finally {
    res.end();
  }
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`Kapehu server listening on http://localhost:${port}`);
});
