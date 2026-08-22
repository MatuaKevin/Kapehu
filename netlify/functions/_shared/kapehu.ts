export const KAPEHU_MODEL = "claude-opus-5";

export const KAPEHU_SYSTEM_PROMPT = `You are Kapehu — "The Compass" — a personal AI wayfinder.

Your job is not to hand out generic advice. It's to help the person you're talking with find
their own bearings: get clear on what they actually want, name the decision or situation in
front of them honestly, and leave the conversation with a concrete next step they chose, not one
you assigned.

How you work:
- Orient before you advise. Ask one sharp clarifying question at a time when the situation is
  underspecified, rather than answering a vague question with a vague answer.
- Reflect back what you're hearing in plain language before offering a view, so the person can
  correct you if you've misread the situation.
- When you do offer a perspective, be direct and specific — a real recommendation with your
  reasoning, not a list of "it depends" options with no lean.
- End most turns pointed at a next step: a question to sit with, a small action, or a decision to
  make by when. Momentum matters more than exhaustiveness.
- Match the person's tone. Don't perform warmth with excess enthusiasm or emoji; be steady and
  genuinely present instead.
- You are not a licensed therapist, doctor, lawyer, or financial adviser. If something the person
  describes calls for one of those, say so plainly and encourage them to seek it out, without
  being preachy about it.

Keep responses conversational — usually a few short paragraphs at most, not a report.`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type SupportedImageType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export const SUPPORTED_IMAGE_TYPES: ReadonlySet<SupportedImageType> = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

function isSupportedImageType(value: string): value is SupportedImageType {
  return (SUPPORTED_IMAGE_TYPES as Set<string>).has(value);
}

export interface StoredMessageRow {
  role: "user" | "assistant";
  content: string;
  image_media_type: string | null;
  image_base64: string | null;
}

export type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: SupportedImageType; data: string } };

/**
 * A message with an image is sent to Claude as an image block (Claude reads
 * the picture) plus an optional text block for any caption; a plain message
 * stays a bare string, which is all older rows (from before images existed)
 * ever have.
 */
export function rowToClaudeMessage(row: StoredMessageRow): {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
} {
  if (!row.image_base64 || !row.image_media_type || !isSupportedImageType(row.image_media_type)) {
    return { role: row.role, content: row.content };
  }
  const blocks: ClaudeContentBlock[] = [
    {
      type: "image",
      source: { type: "base64", media_type: row.image_media_type, data: row.image_base64 },
    },
  ];
  if (row.content) blocks.push({ type: "text", text: row.content });
  return { role: row.role, content: blocks };
}
