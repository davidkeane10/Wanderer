/**
 * Server-side Reddit proxy.
 *
 * Solves two web problems:
 *   1. Browsers can't set User-Agent (forbidden header) — servers can.
 *   2. 15 concurrent browser requests to Reddit trigger rate-limiting.
 *      Here one server IP makes the request with a proper User-Agent.
 *
 * Security: only proxies reddit.com *.json endpoints. Nothing else passes.
 */

const ALLOWED_HOST = "www.reddit.com";
const USER_AGENT =
  "SideQuests/1.0 (web; opensource activity discovery app; contact github.com/sidequests)";

const BASE_HEADERS = {
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request): Promise<Response> {
  let url: string;
  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== "string") throw new Error("missing url");
    url = body.url;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid body" }), {
      status: 400,
      headers: BASE_HEADERS,
    });
  }

  // Strict allow-list: must be www.reddit.com and end in .json
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid URL" }), {
      status: 400,
      headers: BASE_HEADERS,
    });
  }

  if (parsed.hostname !== ALLOWED_HOST || !parsed.pathname.endsWith(".json")) {
    return new Response(JSON.stringify({ error: "URL not allowed" }), {
      status: 403,
      headers: BASE_HEADERS,
    });
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });

    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: BASE_HEADERS,
    });
  } catch (err) {
    console.error("[redditProxy] fetch error:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "Upstream error" }), {
      status: 502,
      headers: BASE_HEADERS,
    });
  }
}
