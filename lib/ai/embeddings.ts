/**
 * Google AI Studio embeddings wrapper.
 *
 * Uses gemini-embedding-001 (1536 dimensions).
 * This MUST match the model used during ETL to ensure vector compatibility.
 */

const GOOGLE_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";

const EXPECTED_DIMENSIONS = 1536;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a 1536-dimensional embedding for the given text via Google AI Studio.
 *
 * Retry logic:
 * - 429 (rate limit): exponential backoff (1s, 2s, …), then retry
 * - 500/503 (server error): retry up to maxRetries
 * - Any other error: throw immediately
 *
 * @param text - Text to embed (typically a user query)
 * @param maxRetries - Total attempts before giving up (default: 3)
 * @returns 1536-dimensional embedding vector
 */
export async function generateEmbedding(
  text: string,
  maxRetries = 3
): Promise<number[]> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_AI_API_KEY environment variable");
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(`${GOOGLE_API_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text }] },
          outputDimensionality: EXPECTED_DIMENSIONS,
        }),
      });

      // Success path
      if (response.ok) {
        const raw: unknown = await response.json();
        const obj = raw as Record<string, unknown>;
        const embeddingObj = obj.embedding as Record<string, unknown> | undefined;
        const embedding = embeddingObj?.values as number[] | undefined;

        if (!embedding || !Array.isArray(embedding)) {
          throw new Error(
            `Unexpected response shape: expected embedding.values array`
          );
        }

        if (embedding.length !== EXPECTED_DIMENSIONS) {
          throw new Error(
            `Expected ${EXPECTED_DIMENSIONS} dimensions, got ${embedding.length}. ` +
              `Are you using gemini-embedding-001 with outputDimensionality=1536?`
          );
        }

        return embedding;
      }

      // Rate limit — exponential backoff
      if (response.status === 429) {
        const waitMs = 1000 * (attempt + 1);
        console.warn(
          `[embeddings] Rate limited (429). Retrying in ${waitMs}ms…`
        );
        await sleep(waitMs);
        continue;
      }

      // Server error — retry
      if (response.status >= 500) {
        const waitMs = 1000 * (attempt + 1);
        console.warn(
          `[embeddings] Server error (${response.status}). Retrying in ${waitMs}ms…`
        );
        await sleep(waitMs);
        continue;
      }

      // Other error — don't retry
      const body = await response.text().catch(() => "unknown");
      throw new Error(`Google AI API error: ${response.status} ${body}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries - 1) {
        const waitMs = 1000 * (attempt + 1);
        console.warn(
          `[embeddings] Request failed (${lastError.message}). Retrying in ${waitMs}ms…`
        );
        await sleep(waitMs);
      }
    }
  }

  throw new Error(
    `Google AI API: max retries (${maxRetries}) exceeded. Last error: ${lastError?.message}`
  );
}
