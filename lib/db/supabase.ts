/**
 * Supabase server-side client.
 *
 * Uses SERVICE_ROLE_KEY — only import this in server-side code (API routes,
 * server components). NEVER expose this to the browser.
 */
import { createClient } from "@supabase/supabase-js";
import type { SearchResult } from "@/types/legal";

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL environment variable");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Reusable Supabase client instance (server-side only).
 *
 * Created lazily so env vars are read at call time, not at import time —
 * this avoids build-time crashes when .env is absent (e.g. CI).
 */
export function getSupabase() {
  return getSupabaseClient();
}

// ---------------------------------------------------------------------------
// Typed RPC helpers
// ---------------------------------------------------------------------------

/**
 * Vector search against `legal_chunks`.
 *
 * Calls the `match_legal_chunks` Postgres function which uses pgvector
 * cosine similarity to find the closest chunks to the given embedding.
 *
 * @param embedding - 384-dimensional vector from HuggingFace all-MiniLM-L6-v2
 * @param matchCount - Number of results to return (default: 5)
 * @param matchThreshold - Minimum similarity score 0–1 (default: 0.5)
 * @param regulation - Optional: filter by regulation name (e.g. "GDPR", "AI Act")
 */
export async function matchLegalChunks(
  embedding: number[],
  matchCount = 5,
  matchThreshold = 0.5,
  regulation?: string | null
): Promise<SearchResult[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase.rpc("match_legal_chunks", {
    query_embedding: embedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
    p_regulation: regulation ?? null,
  });

  if (error) {
    throw new Error(`Supabase RPC error: ${error.message}`);
  }

  // The RPC returns rows directly — cast to our typed result
  return (data ?? []) as SearchResult[];
}

/**
 * Fetch all chunks for given regulation names (for citation matching).
 *
 * The vector search only returns top-N results, but the LLM might cite
 * articles outside those results. This fetches all chunks for the
 * relevant regulations so the citation parser can find matches.
 *
 * @param regulationNames - e.g. ["GDPR", "NIS2 Directive"]
 * @returns All chunks for those regulations (metadata + content only)
 */
export async function fetchChunksByRegulations(
  regulationNames: string[]
): Promise<SearchResult[]> {
  if (regulationNames.length === 0) return [];

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("legal_chunks")
    .select("id, content, metadata")
    .in("metadata->>regulation", regulationNames)
    .limit(500); // Safety limit

  if (error) {
    throw new Error(`Supabase query error: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    ...row,
    similarity: 0, // Not from vector search
  })) as SearchResult[];
}
