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
// Regulation registry (single source of truth)
// ---------------------------------------------------------------------------

/**
 * Canonical list of every regulation in the corpus.
 * Each entry maps triggers (acronyms, aliases, full names) to the
 * canonical name stored in `metadata.regulation`.
 *
 * To add a new regulation, append an entry here.  All downstream
 * functions (detection, expansion, fallback) use this registry
 * automatically — no other code changes needed.
 */
export const REGULATION_REGISTRY: {
  /** Canonical name as stored in metadata.regulation */
  canonical: string;
  /** CELEX ID for direct Supabase queries */
  celexId: string;
  /** All trigger strings that should match this regulation (case-insensitive) */
  triggers: string[];
}[] = [
  {
    canonical: "GDPR",
    celexId: "32016R0679",
    triggers: ["gdpr", "general data protection regulation", "general data protection"],
  },
  {
    canonical: "AI Act",
    celexId: "52021PC0206",
    triggers: ["ai act", "artificial intelligence act"],
  },
  {
    canonical: "Digital Services Act",
    celexId: "32022R2065",
    triggers: ["dsa", "digital services act"],
  },
  {
    canonical: "Digital Markets Act",
    celexId: "32022R1925",
    triggers: ["dma", "digital markets act"],
  },
  {
    canonical: "NIS2 Directive",
    celexId: "32022L2555",
    triggers: ["nis2", "nis2 directive"],
  },
  {
    canonical: "Cyber Resilience Act",
    celexId: "32024R2847",
    triggers: ["cra", "cyber resilience act"],
  },
];

// ---------------------------------------------------------------------------
// Domain synonym library
// ---------------------------------------------------------------------------

/**
 * Domain-agnostic synonym expansion for full-text search.
 *
 * Each entry maps a trigger phrase to additional terms that should be
 * included in the tsvector query.  Only adds terms not already present
 * in the original query.
 *
 * This library is independent of the regulation registry — it contains
 * conceptual synonyms that apply across any legal or compliance corpus.
 *
 * To adapt to a new corpus:
 * - Add entries for domain-specific jargon
 * - Add regulation-specific expansions using the canonical name
 */
const SYNONYM_LIBRARY: [string, string][] = [
  // ── Generic legal concepts ──
  ["obligations", "responsibilities duties requirements shall must"],
  ["transparency", "reporting disclosure audit"],
  ["data protection", "privacy personal data processing"],
  ["incident", "breach notification reporting security"],
  ["risk", "assessment management mitigation"],
  ["cybersecurity", "network security information security"],
  ["erasure", "deletion right to be forgotten removal"],

  // ── Regulation-specific (use canonical names from REGULATION_REGISTRY) ──
  // GDPR
  [
    "gdpr",
    "general data protection regulation processing lawful basis data subject rights"
  ],
  [
    "general data protection regulation",
    "GDPR controller obligations processor DPIA data minimisation"
  ],
  // AI Act
  [
    "ai act",
    "artificial intelligence act risk classification transparency requirements"
  ],
  [
    "artificial intelligence act",
    "AI Act high-risk systems conformity assessment obligations"
  ],
  // DSA
  [
    "dsa",
    "digital services act very large online platforms moderation systemic risk obligations"
  ],
  [
    "digital services act",
    "DSA very large online platforms obligations systemic risk notice and action"
  ],
  // DMA
  [
    "dma",
    "digital markets act gatekeepers interoperability self-preferencing obligation"
  ],
  [
    "digital markets act",
    "DMA gatekeepers obligations interoperability data access"
  ],
  // NIS2
  [
    "nis2",
    "nis2 directive cybersecurity incident reporting essential entities"
  ],
  [
    "nis2 directive",
    "NIS2 cybersecurity requirements supervision enforcement"
  ],
  // CRA
  [
    "cra",
    "cyber resilience act security-by-design vulnerability handling"
  ],
  [
    "cyber resilience act",
    "CRA conformity assessment essential requirements security updates"
  ],
];

// ---------------------------------------------------------------------------
// Query expansion
// ---------------------------------------------------------------------------

/**
 * Expand a legal query with related terms from the synonym library
 * to improve full-text search recall.
 *
 * Only adds terms not already present in the query.
 */
export function expandQuery(query: string): string {
  const lower = query.toLowerCase();

  let expanded = query;
  for (const [trigger, addition] of SYNONYM_LIBRARY) {
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
// Regulation auto-detection
// ---------------------------------------------------------------------------

/**
 * Detect if the user query mentions exactly one known regulation.
 *
 * Returns the canonical regulation name for filtering when a single
 * regulation is mentioned, or `null` when zero or multiple are detected
 * (to avoid over-filtering cross-regulation queries).
 *
 * Case-insensitive. Uses the REGULATION_REGISTRY so new regulations
 * are detected automatically.
 */
export function detectRegulationFilter(query: string): string | null {
  const lower = query.toLowerCase();

  const found = new Set<string>();
  for (const reg of REGULATION_REGISTRY) {
    for (const trigger of reg.triggers) {
      if (lower.includes(trigger)) {
        found.add(reg.canonical);
        break; // One match per regulation is enough
      }
    }
  }

  return found.size === 1 ? Array.from(found)[0] : null;
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
 * Generic re-ranking: if a regulation was detected, keep only results
 * from that regulation.  If the filtered set is too small, fetch
 * directly from the regulation as a fallback.
 *
 * This replaces regulation-specific hacks (like the old DSA VLOP
 * injection) with a single, corpus-agnostic algorithm.
 */
async function rerankByRegulation(
  results: SearchResult[],
  queryText: string,
  matchCount: number,
  detectedReg: string | null
): Promise<SearchResult[]> {
  if (!detectedReg) return results;

  // Filter to the detected regulation
  const filtered = results.filter(
    (r) => (r.metadata as Record<string, unknown>)?.regulation === detectedReg
  );

  // If we have enough results from the right regulation, return them
  if (filtered.length >= 3) return filtered;

  // Not enough — fetch directly from the regulation
  const supabase = getSupabase();
  const { data } = await supabase
    .from("legal_chunks")
    .select("id, content, metadata")
    .eq("metadata->>regulation", detectedReg)
    .limit(matchCount);

  if (data && data.length > 0) {
    return data.map((d) => ({ ...d, similarity: 0.99 } as SearchResult));
  }

  // Direct fetch also failed — return original results
  return results;
}

/**
 * Hybrid search: vector similarity + full-text search combined via RRF.
 *
 * Primary search function with generic fallback chain:
 * 1. Hybrid RPC (vector + FTS fused via RRF)
 * 2. Re-rank by detected regulation (filters out wrong-regulation noise)
 * 3. Vector-only fallback
 */
export async function searchLegalChunks(
  embedding: number[],
  queryText: string,
  matchCount = 10,
  regulation?: string | null
): Promise<SearchResult[]> {
  const supabase = getSupabase();
  const expandedQuery = expandQuery(queryText);

  // Client-provided filter takes precedence over auto-detection
  const effectiveReg = regulation ?? detectRegulationFilter(queryText);

  try {
    const { data, error } = await supabase.rpc("hybrid_search_legal_chunks", {
      query_embedding: embedding,
      query_text: expandedQuery,
      match_count: matchCount,
      p_regulation: effectiveReg ?? null,
    });

    if (error) {
      console.warn("[search] Hybrid RPC failed, falling back to vector:", error.message);
      const vectorResults = await matchLegalChunks(embedding, matchCount, 0.15, effectiveReg);
      return rerankByRegulation(vectorResults, queryText, matchCount, effectiveReg);
    }

    let results = (data ?? []) as SearchResult[];

    // Re-rank: filter to detected regulation, fallback to direct fetch if sparse
    results = await rerankByRegulation(results, queryText, matchCount, effectiveReg);

    if (results.length > 0) return results;

    // Everything failed — try vector as last resort
    const vectorResults = await matchLegalChunks(embedding, matchCount, 0.15, effectiveReg);
    return rerankByRegulation(vectorResults, queryText, matchCount, effectiveReg);
  } catch (err) {
    console.warn("[search] Hybrid failed, falling back to vector:", err);
    return matchLegalChunks(embedding, matchCount, 0.15, effectiveReg);
  }
}

/**
 * Fetch chunks by CELEX ID for citation matching.
 * Uses REGULATION_REGISTRY so new regulations work automatically.
 */
export async function fetchChunksByRegulations(
  regulationNames: string[]
): Promise<SearchResult[]> {
  if (regulationNames.length === 0) return [];

  const supabase = getSupabase();
  const allData: SearchResult[] = [];

  // Build CELEX lookup from registry
  const REGULATION_TO_CELEX: Record<string, string> = {};
  for (const reg of REGULATION_REGISTRY) {
    REGULATION_TO_CELEX[reg.canonical] = reg.celexId;
  }

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
