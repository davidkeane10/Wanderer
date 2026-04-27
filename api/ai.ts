/**
 * Server-side AI proxy — Vercel Edge Function.
 *
 * Uses Groq's OpenAI-compatible API (free tier, 14,400 req/day).
 * The GROQ_API_KEY lives here — never shipped in the client JS bundle.
 *
 * The client sends { system, user } and receives { text }.
 * Input is capped to prevent abuse; only POST is accepted.
 */

const GROQ_KEY = process.env.GROQ_API_KEY ?? "";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const MAX_SYSTEM_CHARS = 3_000;
const MAX_USER_CHARS = 5_000;

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  // Only POST
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Key must be configured on the server
  if (!GROQ_KEY) {
    return json({ error: "AI not configured on server" }, 503);
  }

  // Parse and validate body
  let body: { system?: unknown; user?: unknown };
  try {
    body = (await request.json()) as { system?: unknown; user?: unknown };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (typeof body.system !== "string" || typeof body.user !== "string") {
    return json({ error: "system and user must be strings" }, 400);
  }

  // Cap inputs — prevents prompt-stuffing and runaway costs
  const system = body.system.slice(0, MAX_SYSTEM_CHARS);
  const user = body.user.slice(0, MAX_USER_CHARS);

  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 1024,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!upstream.ok) {
      console.error("[ai proxy] upstream error", upstream.status);
      return json({ error: "AI upstream error" }, 502);
    }

    const data = (await upstream.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? "{}";
    return json({ text }, 200);
  } catch (err) {
    console.error("[ai proxy] fetch failed", err);
    return json({ error: "Request failed" }, 502);
  }
}

function json(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
