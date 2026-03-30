/**
 * HuggingFace Inference API wrapper for generating text embeddings.
 *
 * Uses sentence-transformers/all-MiniLM-L6-v2 (384 dimensions).
 * This MUST match the model used during ETL to ensure vector compatibility.
 */

const HF_API_URL =
  "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction";

const EXPECTED_DIMENSIONS = 384;

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
 * Generate a 384-dimensional embedding for the given text via HuggingFace.
 *
 * Retry logic:
 * - 503 (cold start / model loading): wait `estimated_time` seconds, then retry
 * - 429 (rate limit): exponential backoff (1s, 2s, …), then retry
 * - Any other error: throw immediately
 *
 * @param text - Text to embed (typically a user query)
 * @param maxRetries - Total attempts before giving up (default: 2, meaning 1 retry)
 * @returns 384-dimensional embedding vector
 */
export async function generateEmbedding(
  text: string,
  maxRetries = 2
): Promise<number[]> {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing HUGGINGFACE_API_KEY environment variable");
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(HF_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: [text] }),
      });

      // Success path
      if (response.ok) {
        const raw: unknown = await response.json();

        // API returns 2D array [[...]] for feature-extraction; extract first
        let embedding: number[];
        if (Array.isArray(raw) && Array.isArray(raw[0])) {
          embedding = raw[0] as number[];
        } else if (Array.isArray(raw) && typeof raw[0] === "number") {
          embedding = raw as number[];
        } else {
          throw new Error(
            `Unexpected response shape: expected number[] or number[][], got ${typeof raw}`
          );
        }

        if (embedding.length !== EXPECTED_DIMENSIONS) {
          throw new Error(
            `Expected ${EXPECTED_DIMENSIONS} dimensions, got ${embedding.length}. ` +
              `Are you using the correct model (all-MiniLM-L6-v2)?`
          );
        }

        return embedding;
      }

      // Cold start — model is loading
      if (response.status === 503) {
        let waitSeconds = 20; // Default if parsing fails
        try {
          const body = await response.json();
          waitSeconds = body.estimated_time ?? waitSeconds;
        } catch {
          // Ignore parse errors — use default
        }
        console.warn(
          `[embeddings] Model loading (503). Retrying in ${waitSeconds}s…`
        );
        await sleep(waitSeconds * 1000);
        continue;
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

      // Other error — don't retry
      throw new Error(`HuggingFace API error: ${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Only network/fetch errors reach here — retry them
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
    `HuggingFace API: max retries (${maxRetries}) exceeded. Last error: ${lastError?.message}`
  );
}
