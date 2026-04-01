/**
 * LLM streaming client with Cerebras → Groq fallback.
 *
 * Both providers expose OpenAI-compatible chat completion APIs with SSE streaming.
 * We use direct fetch (no SDK) for full control over fallback timing.
 *
 * Server-side only — never expose API keys to the browser.
 */
import type { LLMStreamResult } from "@/types/legal";

// ---------------------------------------------------------------------------
// Provider configs
// ---------------------------------------------------------------------------

interface ProviderConfig {
  url: string;
  apiKeyEnv: string;
  model: string;
  name: "cerebras" | "groq";
}

const PROVIDERS: ProviderConfig[] = [
  {
    name: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    apiKeyEnv: "GROQ_API_KEY",
    model: "llama-3.3-70b-versatile",
  },
  {
    name: "cerebras",
    url: "https://api.cerebras.ai/v1/chat/completions",
    apiKeyEnv: "CEREBRAS_API_KEY",
    model: "llama3.1-8b",
  },
];

const TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// SSE parsing
// ---------------------------------------------------------------------------

/**
 * Parse an OpenAI-compatible SSE stream from a provider into a
 * ReadableStream<string> emitting only the content deltas.
 *
 * OpenAI SSE format:
 *   data: {"choices":[{"delta":{"content":"hello"}}]}
 *   data: [DONE]
 */
function parseProviderSSE(body: ReadableStream<Uint8Array>): ReadableStream<string> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";

  return new ReadableStream<string>({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Process any remaining buffer
          if (buffer.trim()) {
            processBuffer(buffer, controller);
          }
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines (SSE uses \n\n as event separator)
        const lines = buffer.split("\n");
        // Keep the last (potentially incomplete) line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          processLine(line, controller);
        }
      }
    },
  });
}

function processLine(line: string, controller: ReadableStreamDefaultController<string>) {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith("data: ")) return;

  const data = trimmed.slice(6); // Remove "data: " prefix
  if (data === "[DONE]") return;

  try {
    const parsed = JSON.parse(data);
    const content = parsed?.choices?.[0]?.delta?.content;
    if (typeof content === "string" && content.length > 0) {
      controller.enqueue(content);
    }
  } catch {
    // Ignore malformed JSON lines — some providers emit keep-alives
  }
}

function processBuffer(buffer: string, controller: ReadableStreamDefaultController<string>) {
  for (const line of buffer.split("\n")) {
    processLine(line, controller);
  }
}

// ---------------------------------------------------------------------------
// Provider call
// ---------------------------------------------------------------------------

/**
 * Call a single LLM provider with a timeout.
 *
 * @throws If the request fails, times out, or returns non-OK status
 */
async function callProvider(config: ProviderConfig, systemPrompt: string, userPrompt: string): Promise<ReadableStream<string>> {
  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`Missing ${config.apiKeyEnv} environment variable`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1024,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "unknown");
      throw new Error(
        `${config.name} API error: ${response.status} — ${body}`
      );
    }

    if (!response.body) {
      throw new Error(`${config.name} API: no response body`);
    }

    return parseProviderSSE(response.body);
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Stream an LLM response with automatic Cerebras → Groq fallback.
 *
 * Tries Cerebras first. If it fails (network, timeout, API error),
 * falls back to Groq. If both fail, throws.
 *
 * @param systemPrompt - System prompt (with legal context injected)
 * @param userPrompt - User message (with conversation history)
 * @returns LLMStreamResult with the stream and which provider was used
 */
export async function streamLLM(
  systemPrompt: string,
  userPrompt: string
): Promise<LLMStreamResult> {
  let lastError: Error | null = null;

  for (const provider of PROVIDERS) {
    try {
      console.log(`[llm-client] Trying ${provider.name}…`);
      const stream = await callProvider(provider, systemPrompt, userPrompt);
      console.log(`[llm-client] Using ${provider.name}`);
      return { stream, provider: provider.name };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[llm-client] ${provider.name} failed: ${lastError.message}. ` +
          `${provider === PROVIDERS[0] ? "Falling back…" : "All providers failed."}`
      );
    }
  }

  throw new Error(
    `All LLM providers failed. Last error: ${lastError?.message}`
  );
}
