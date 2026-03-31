/**
 * POST /api/chat — EuroLex AI RAG pipeline endpoint.
 *
 * Flow:
 *   1. Validate request body (message required, ≤4000 chars)
 *   2. Generate embedding via HuggingFace (all-MiniLM-L6-v2, 384d)
 *   3. Vector search via Supabase RPC (match_legal_chunks)
 *   4. Build prompt with legal context + conversation history
 *   5. Stream LLM response (Cerebras primary → Groq fallback)
 *   6. Parse citations from accumulated text, emit as SSE events
 *
 * Response: Server-Sent Events (text/event-stream)
 *   event: chunk  → { content: string }
 *   event: citation → { regulation, article, celexId, eurlexUrl, excerpt }
 *   event: done   → { provider, chunksFound }
 *   event: error   → { message }
 */
import { NextRequest } from "next/server";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { matchLegalChunks } from "@/lib/db/supabase";
import { buildPrompt } from "@/lib/ai/prompts";
import { streamLLM } from "@/lib/ai/llm-client";
import { parseCitations } from "@/lib/utils/citations";
import type { LegalChunk, Citation, ChatMessage } from "@/types/legal";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum allowed message length (characters). */
const MAX_MESSAGE_LENGTH = 4000;

/** Minimum similarity threshold for vector search. */
const SIMILARITY_THRESHOLD = 0.3;

/** Number of chunks to retrieve from Supabase. */
const CHUNK_COUNT = 5;

/** SSE response headers (includes CORS for cross-origin clients). */
const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Clean malformed citation markers from text.
 * Removes [[X]] where X is not a known regulation or valid article number.
 * Valid: [[GDPR]], [[GDPR-Article 5]], [[AI Act-Article 4]]
 * Invalid: [[GDPR-d]], [[GDPR-unknown]], [[foo]]
 */
const KNOWN_REGULATIONS = ["gdpr", "ai act", "digital services act", "digital markets act"];

function cleanMalformedCitations(text: string): string {
  // Remove [[...]] with single-letter "articles" like [[GDPR-d]] or [[GDPR-(d)]]
  text = text.replace(/\[\[([A-Za-z\s]+?)-\(?\s*[a-d]\s*\)?\]\]/gi, "[[$1]]");
  // Remove [[...]] with "unknown"
  text = text.replace(/\[\[([A-Za-z\s]+?)-unknown[^\]]*\]\]/gi, "[[$1]]");
  // Remove [[...]] with anything that's not a valid "Article N" after dash
  text = text.replace(/\[\[([A-Za-z\s]+?)-(?!Article\s+\d)[^\]]+\]\]/gi, "[[$1]]");
  return text;
}

function sseEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Build a JSON error response with appropriate status code.
 */
function errorResponse(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...SSE_HEADERS,
    },
  });
}

// ---------------------------------------------------------------------------
// CORS preflight
// ---------------------------------------------------------------------------

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: SSE_HEADERS,
  });
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // ── 1. Parse & validate request body ──────────────────────────────────
  let body: { message?: string; history?: ChatMessage[]; regulation?: string | null };

  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const { message, history = [], regulation = null } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return errorResponse(400, "Message is required and must be non-empty");
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return errorResponse(
      400,
      `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`
    );
  }

  // ── 2. Generate embedding ─────────────────────────────────────────────
  let embedding: number[];

  try {
    embedding = await generateEmbedding(message);
  } catch (error) {
    console.error("[chat] Embedding generation failed:", error);
    return errorResponse(503, "Embedding service unavailable");
  }

  // ── 3. Vector search (Supabase) ───────────────────────────────────────
  let chunks: LegalChunk[] = [];

  try {
    const results = await matchLegalChunks(
      embedding,
      CHUNK_COUNT,
      SIMILARITY_THRESHOLD,
      regulation
    );
    // SearchResult and LegalChunk have the same shape — safe cast
    chunks = results as LegalChunk[];
  } catch (error) {
    // Supabase failure is non-fatal — the LLM can still answer general questions
    console.error("[chat] Supabase search failed, continuing without context:", error);
    chunks = [];
  }

  // ── 4. Build prompt ───────────────────────────────────────────────────
  const { systemPrompt, userPrompt } = buildPrompt(chunks, history, message);

  // ── 5. Stream LLM response ────────────────────────────────────────────
  let llmResult;

  try {
    llmResult = await streamLLM(systemPrompt, userPrompt);
  } catch (error) {
    console.error("[chat] All LLM providers failed:", error);
    return errorResponse(503, "AI service unavailable");
  }

  const { stream: llmStream, provider } = llmResult;

  // ── 6. Build SSE stream with chunk + citation events ──────────────────
  const encoder = new TextEncoder();
  let accumulatedText = "";
  const emittedCitationKeys = new Set<string>();

  const sseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const reader = llmStream.getReader();

        while (true) {
          const { done, value: textChunk } = await reader.read();

          if (done) {
            // ── Emit done event ──
            controller.enqueue(
              encoder.encode(
                sseEvent("done", {
                  provider,
                  chunksFound: chunks.length,
                })
              )
            );
            controller.close();
            return;
          }

          // Accumulate text for citation parsing
          accumulatedText += textChunk;

          // Clean malformed citations from the chunk before emitting
          const cleanedChunk = cleanMalformedCitations(textChunk);

          // Emit chunk event to client
          controller.enqueue(
            encoder.encode(sseEvent("chunk", { content: cleanedChunk }))
          );

          // ── Parse citations from accumulated text ──
          if (chunks.length > 0) {
            const citations = parseCitations(accumulatedText, chunks);

            for (const citation of citations) {
              const key = `${citation.regulation}:${citation.article}`;
              if (!emittedCitationKeys.has(key)) {
                emittedCitationKeys.add(key);

                // Build excerpt: first 1000 chars of chunk content
                const excerpt = citation.chunk_content
                  ? citation.chunk_content.slice(0, 1000) +
                    (citation.chunk_content.length > 1000 ? "…" : "")
                  : "";

                controller.enqueue(
                  encoder.encode(
                    sseEvent("citation", {
                      regulation: citation.regulation,
                      article: citation.article,
                      celexId: citation.celex_id,
                      eurlexUrl: citation.eurlex_url,
                      excerpt,
                      similarity: citation.similarity,
                    })
                  )
                );
              }
            }
          }
        }
      } catch (error) {
        // Stream interrupted — emit error event before closing
        const message =
          error instanceof Error ? error.message : "Stream interrupted";
        console.error("[chat] Stream error:", message);

        try {
          controller.enqueue(encoder.encode(sseEvent("error", { message })));
        } catch {
          // Controller may already be closed — ignore
        }

        controller.close();
      }
    },
  });

  // ── 7. Return SSE response ────────────────────────────────────────────
  return new Response(sseStream, {
    status: 200,
    headers: SSE_HEADERS,
  });
}
