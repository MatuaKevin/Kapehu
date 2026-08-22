/**
 * Kapehu is single-user (just one passcode, shared across all of that
 * person's own devices) rather than full multi-user auth — there's no
 * account system to build for an audience of one.
 */
export function isAuthorized(req: Request): boolean {
  const expected = Netlify.env.get("KAPEHU_PASSCODE");
  if (!expected) return false;

  const header = req.headers.get("Authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  return provided.length > 0 && provided === expected;
}

export function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "Invalid or missing passcode." }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
