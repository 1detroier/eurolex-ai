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
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getSupabase() {
  return getSupabaseClient();
}

// ---------------------------------------------------------------------------
// Query expansion
// ---------------------------------------------------------------------------

/**
 * Expand a legal query with related terms to improve full-text search.
 *
 * Only adds terms not already present in the query.
 */
export function expandQuery(query: string): string {
  const lower = query.toLowerCase();
  const expansions: [string, string][] = [
    ["obligations", "responsibilities duties requirements shall must"],
    ["very large platforms", "VLOPs systemic platforms major providers"],
    ["very large online platforms", "VLOPs systemic risk"],
    ["gatekeeper", "gatekeepers designated platforms core platform services"],
    ["transparency", "reporting disclosure audit"],
    ["data protection", "privacy personal data processing"],
    ["incident", "breach notification reporting security"],
    ["risk", "assessment management mitigation"],
    ["cybersecurity", "network security information security"],
    ["erasure", "deletion right to be forgotten removal"],
    // Regulation acronyms and shorthand
    [
      "dsa",
      "digital services act very large online platforms moderation systemic risk obligations"
    ],
    [
      "digital services act",
      "DSA very large online platforms obligations systemic risk notice and action"
    ],
    [
      "dma",
      "digital markets act gatekeepers interoperability self-preferencing obligation"
    ],
    [
      "digital markets act",
      "DMA gatekeepers obligations interoperability data access"
    ],
    [
      "gdpr",
      "general data protection regulation processing lawful basis data subject rights"
    ],
    [
      "general data protection regulation",
      "GDPR controller obligations processor DPIA data minimisation"
    ],
    [
      "ai act",
      "artificial intelligence act risk classification transparency requirements"
    ],
    [
      "artificial intelligence act",
      "AI Act high-risk systems conformity assessment obligations"
    ],
    [
      "nis2",
      "nis2 directive cybersecurity incident reporting essential entities"
    ],
    [
      "nis2 directive",
      "NIS2 cybersecurity requirements supervision enforcement"
    ],
    [
      "cra",
      "cyber resilience act security-by-design vulnerability handling"
    ],
    [
      "cyber resilience act",
      "CRA conformity assessment essential requirements security updates"
    ],
  ];

  let expanded = query;
  for (const [trigger, addition] of expansions) {
    if (lower.includes(trigger)) {
      const newTerms = addition.split(" ").filter((t) => !lower.includes(t));
      if (newTerms.length > 0) {
        expanded += " " + newTerms.join(" ");
      }
    }
  }
  return expanded;
}

// ---------------------------------------------------------------------------
// Search functions
// ---------------------------------------------------------------------------

/**
 * Vector-only search (original). Kept as fallback.
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

  if (error) throw new Error(`Vector search error: ${error.message}`);
  return (data ?? []) as SearchResult[];
}

/**
 * Ensure we have enough context by filling gaps with regulation-specific
 * chunks.  If the hybrid / vector search returned nothing for a regulation
 * mentioned in the query, fetch chunks directly by metadata match.
 */
async function fillFromKnownRegulations(
  existing: SearchResult[],
  queryText: string,
  count: number
): Promise<SearchResult[]> {
  const lower = queryText.toLowerCase();
  const knownRegs: [string, string][] = [
    ["dsa", "Digital Services Act"],
    ["digital services act", "Digital Services Act"],
    ["dma", "Digital Markets Act"],
    ["digital markets act", "Digital Markets Act"],
    ["gdpr", "GDPR"],
    ["general data protection", "GDPR"],
    ["ai act", "AI Act"],
    ["artificial intelligence act", "AI Act"],
    ["nis2", "NIS2 Directive"],
    ["nis2 directive", "NIS2 Directive"],
    ["cra", "Cyber Resilience Act"],
    ["cyber resilience act", "Cyber Resilience Act"],
  ];

  const mentioned = new Set<string>();
  for (const [trigger, name] of knownRegs) {
    if (lower.includes(trigger)) mentioned.add(name);
  }
  if (mentioned.size === 0) return existing;

  const existingRegs = new Set(
    existing.map((r) => (r.metadata as Record<string, unknown>)?.regulation as string)
  );

  // Only fetch regulations that were mentioned but not yet returned
  const missing = Array.from(mentioned).filter((r) => !existingRegs.has(r));
  if (missing.length === 0) return existing;

  const supabase = getSupabase();
  const extra: SearchResult[] = [];

  for (const regName of missing) {
    try {
      const { data } = await supabase
        .from("legal_chunks")
        .select("id, content, metadata")
        .eq("metadata->>regulation", regName)
        .limit(count);

      if (data) {
        for (const row of data) {
          extra.push({ ...row, similarity: 0 } as SearchResult);
        }
      }
    } catch {
      // Skip failed queries
    }
  }

  return [...existing, ...extra];
}

/**
 * Hybrid search: vector similarity + full-text search combined via RRF.
 *
 * This is the primary search function. Falls back to vector-only, then
 * to direct regulation lookup if the hybrid RPC fails or returns nothing.
 */
export async function searchLegalChunks(
  embedding: number[],
  queryText: string,
  matchCount = 10,
  regulation?: string | null
): Promise<SearchResult[]> {
  const supabase = getSupabase();
  const expandedQuery = expandQuery(queryText);

  try {
    const { data, error } = await supabase.rpc("hybrid_search_legal_chunks", {
      query_embedding: embedding,
      query_text: expandedQuery,
      match_count: matchCount,
      p_regulation: regulation ?? null,
    });

    if (error) {
      console.warn("[search] Hybrid RPC failed, falling back to vector:", error.message);
      return matchLegalChunks(embedding, matchCount, 0.15, regulation);
    }

    const results = (data ?? []) as SearchResult[];

    // If hybrid returned too few results, fill from known regulations
    if (results.length < 3) {
      const filled = await fillFromKnownRegulations(results, queryText, matchCount);
      if (filled.length > 0) return filled;
    }

    if (results.length > 0) return results;

    // Hybrid returned nothing — try vector as fallback
    const vectorResults = await matchLegalChunks(embedding, matchCount, 0.15, regulation);
    return await fillFromKnownRegulations(vectorResults, queryText, matchCount);
  } catch (err) {
    console.warn("[search] Hybrid failed, falling back to vector:", err);
    return matchLegalChunks(embedding, matchCount, 0.15, regulation);
  }
}

/**
 * Fetch chunks by CELEX ID for citation matching.
 */
export async function fetchChunksByRegulations(
  regulationNames: string[]
): Promise<SearchResult[]> {
  if (regulationNames.length === 0) return [];

  const supabase = getSupabase();
  const allData: SearchResult[] = [];

  const REGULATION_TO_CELEX: Record<string, string> = {
    "GDPR": "32016R0679",
    "AI Act": "52021PC0206",
    "Digital Services Act": "32022R2065",
    "Digital Markets Act": "32022R1925",
    "NIS2 Directive": "32022L2555",
    "Cyber Resilience Act": "32024R2847",
  };

  for (const name of regulationNames) {
    try {
      const celexId = REGULATION_TO_CELEX[name];
      if (!celexId) continue;

      const { data } = await supabase
        .from("legal_chunks")
        .select("id, content, metadata")
        .eq("metadata->>celex_id", celexId)
        .limit(200);

      if (data) {
        for (const row of data) {
          allData.push({ ...row, similarity: 0 } as SearchResult);
        }
      }
    } catch {
      // Skip failed queries
    }
  }

  return allData;
}
