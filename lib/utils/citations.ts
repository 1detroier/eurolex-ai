/**
 * Citation parser — extracts [Source: ...] markers from LLM responses
 * and maps them to EUR-Lex URLs using the retrieved chunks.
 */
import type { Citation, LegalChunk } from "@/types/legal";

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/**
 * Matches citation markers in LLM output:
 *   [Source: GDPR Article 17]
 *   [Source: AI Act Article 4]
 *   [Source: DSA Article 34]
 *
 * Captures: regulation name and article number.
 */
const CITATION_REGEX = /\[Source:\s*([^\]]+?)\s+Article\s+(\d+)\s*\]/gi;

/**
 * Matches an article number from a chunk's metadata.article field.
 * Handles: "Article 17", "Art. 17", "Art 17"
 */
const ARTICLE_NUM_REGEX = /(?:Article|Art\.?)\s+(\d+)/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the numeric article string from a metadata article field.
 * "Article 17" → "17", "Art. 4" → "4"
 */
function extractArticleNumber(article: string): string | null {
  const match = article.match(ARTICLE_NUM_REGEX);
  return match ? match[1] : null;
}

/**
 * Build the EUR-Lex URL for a given CELEX ID and article number.
 */
function buildEurlexUrl(celexId: string, articleNumber: string): string {
  return `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celexId}#art_${articleNumber}`;
}

/**
 * Normalize a regulation name for comparison.
 * "GDPR" → "gdpr", "AI Act" → "ai act", "aiact" → "ai act"
 */
function normalizeRegulation(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse citation markers from an LLM response and match them against
 * the chunks that were used for context.
 *
 * Deduplicates citations by regulation + article combination.
 *
 * @param text - The LLM response text containing [Source: ...] markers
 * @param chunks - The legal chunks used as context for this response
 * @returns Deduplicated Citation objects with EUR-Lex URLs
 */
export function parseCitations(text: string, chunks: LegalChunk[]): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<string>(); // key: "regulation:article"

  let match: RegExpExecArray | null;
  CITATION_REGEX.lastIndex = 0;

  while ((match = CITATION_REGEX.exec(text)) !== null) {
    const regulationRaw = match[1].trim();
    const articleNumber = match[2];
    const dedupeKey = `${normalizeRegulation(regulationRaw)}:${articleNumber}`;

    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    // Find matching chunk
    const matchedChunk = chunks.find((chunk) => {
      const chunkRegulation = normalizeRegulation(chunk.metadata.regulation);
      const citeRegulation = normalizeRegulation(regulationRaw);
      const chunkArticleNum = extractArticleNumber(chunk.metadata.article);

      return chunkRegulation === citeRegulation && chunkArticleNum === articleNumber;
    });

    if (matchedChunk) {
      citations.push({
        id: `${dedupeKey}-${citations.length}`,
        regulation: matchedChunk.metadata.regulation,
        article: matchedChunk.metadata.article,
        celex_id: matchedChunk.metadata.celex_id,
        eurlex_url: buildEurlexUrl(matchedChunk.metadata.celex_id, articleNumber),
        chunk_content: matchedChunk.content,
        similarity: matchedChunk.similarity,
      });
    } else {
      // Citation found in text but no matching chunk — still create it
      // so the UI can show "Source not in retrieved context"
      citations.push({
        id: `${dedupeKey}-${citations.length}`,
        regulation: regulationRaw,
        article: `Article ${articleNumber}`,
        celex_id: "",
        eurlex_url: "",
        chunk_content: "",
        similarity: 0,
      });
    }
  }

  return citations;
}
