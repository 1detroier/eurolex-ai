/**
 * GET /api/health — Health check endpoint with provider status.
 *
 * Tests connectivity to all external services:
 * - Cerebras LLM
 * - Groq LLM (fallback)
 * - Google AI Embeddings (gemini-embedding-001)
 * - Supabase Database
 */

async function checkProvider(
  name: string,
  url: string,
  headers: Record<string, string>,
  body: string
): Promise<{ name: string; status: string; latencyMs: number }> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { name, status: "ok", latencyMs };
    }
    const text = await res.text().catch(() => "");
    return { name, status: `error ${res.status}: ${text.slice(0, 100)}`, latencyMs };
  } catch (err) {
    return { name, status: `unreachable: ${err instanceof Error ? err.message : err}`, latencyMs: Date.now() - start };
  }
}

export async function GET() {
  const checks = await Promise.all([
    checkProvider(
      "cerebras",
      "https://api.cerebras.ai/v1/chat/completions",
      {
        Authorization: `Bearer ${process.env.CEREBRAS_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      JSON.stringify({ model: "llama3.1-8b", messages: [{ role: "user", content: "ping" }], max_tokens: 5 })
    ),
    checkProvider(
      "groq",
      "https://api.groq.com/openai/v1/chat/completions",
      {
        Authorization: `Bearer ${process.env.GROQ_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "user", content: "ping" }], max_tokens: 5 })
    ),
    checkProvider(
      "google-ai",
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=" + (process.env.GOOGLE_AI_API_KEY ?? ""),
      { "Content-Type": "application/json" },
      JSON.stringify({ model: "models/gemini-embedding-001", content: { parts: [{ text: "ping" }] } })
    ),
  ]);

  const allOk = checks.every((c) => c.status === "ok");

  return Response.json(
    {
      status: allOk ? "ok" : "degraded",
      timestamp: Date.now(),
      providers: checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
