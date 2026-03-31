/**
 * Citation parser — extracts (REGULATION-Article N) and (REGULATION) markers
 * from LLM responses and maps them to EUR-Lex URLs using the retrieved chunks.
 */
import type { Citation, LegalChunk } from "@/types/legal";

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/**
 * Matches citations WITH article number:
 *   (GDPR-Article 17), (AI Act-Article 4), (Digital Services Act-Article 34)
 */
const CITATION_WITH_ARTICLE_REGEX = /\(([A-Za-z\s]+?)-Article\s+(\d+)\)/gi;

/**
 * Matches citations WITHOUT article number (just regulation):
 *   (GDPR), (AI Act), (Digital Services Act)
 */
const CITATION_NO_ARTICLE_REGEX = /\(([A-Za-z][A-Za-z\s]+?)\)/g;

/**
 * Known regulation names to distinguish from other parenthetical text.
 */
const KNOWN_REGULATIONS = [
  "gdpr", "ai act", "digital services act", "digital markets act",
];

/**
 * Matches an article number from a chunk's metadata.article field.
 */
const ARTICLE_NUM_REGEX = /(?:Article|Art\.?)\s+(\d+)/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractArticleNumber(article: string): string | null {
  const match = article.match(ARTICLE_NUM_REGEX);
  return match ? match[1] : null;
}

function buildEurlexUrl(celexId: string, articleNumber?: string): string {
  const base = `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celexId}`;
  return articleNumber ? `${base}#art_${articleNumber}` : base;
}

function normalizeRegulation(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function isKnownRegulation(name: string): boolean {
  return KNOWN_REGULATIONS.includes(normalizeRegulation(name));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse citation markers from an LLM response and match them against
 * the chunks that were used for context.
 *
 * Handles two formats:
 *   (GDPR-Article 5)  → citation with specific article
 *   (GDPR)            → citation to regulation only (no article)
 *
 * @param text - The LLM response text containing citation markers
 * @param chunks - The legal chunks used as context for this response
 * @returns Deduplicated Citation objects with EUR-Lex URLs
 */
export function parseCitations(text: string, chunks: LegalChunk[]): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<string>();

  // ── Parse (Regulation-Article N) citations ──
  let match: RegExpExecArray | null;
  CITATION_WITH_ARTICLE_REGEX.lastIndex = 0;

  while ((match = CITATION_WITH_ARTICLE_REGEX.exec(text)) !== null) {
    const regulationRaw = match[1].trim();
    const articleNumber = match[2];
    const dedupeKey = `${normalizeRegulation(regulationRaw)}:art${articleNumber}`;

    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const matchedChunk = chunks.find((chunk) => {
      const chunkRegulation = normalizeRegulation(chunk.metadata.regulation);
      const citeRegulation = normalizeRegulation(regulationRaw);
      const chunkArticleNum = extractArticleNumber(chunk.metadata.article);
      return chunkRegulation === citeRegulation && chunkArticleNum === articleNumber;
    });

    if (matchedChunk) {
      citations.push({
        id: `cite-${citations.length}`,
        regulation: matchedChunk.metadata.regulation,
        article: `Article ${articleNumber}`,
        celex_id: matchedChunk.metadata.celex_id,
        eurlex_url: buildEurlexUrl(matchedChunk.metadata.celex_id, articleNumber),
        chunk_content: matchedChunk.content,
        similarity: matchedChunk.similarity,
      });
    } else {
      // Try to find any chunk from this regulation for CELEX ID
      const regChunk = chunks.find(
        (c) => normalizeRegulation(c.metadata.regulation) === normalizeRegulation(regulationRaw)
      );
      citations.push({
        id: `cite-${citations.length}`,
        regulation: regulationRaw,
        article: `Article ${articleNumber}`,
        celex_id: regChunk?.metadata.celex_id ?? "",
        eurlex_url: regChunk ? buildEurlexUrl(regChunk.metadata.celex_id, articleNumber) : "",
        chunk_content: "",
        similarity: 0,
      });
    }
  }

  // ── Parse (Regulation) citations without article number ──
  CITATION_NO_ARTICLE_REGEX.lastIndex = 0;

  while ((match = CITATION_NO_ARTICLE_REGEX.exec(text)) !== null) {
    const regulationRaw = match[1].trim();
    if (!isKnownRegulation(regulationRaw)) continue;

    const dedupeKey = `${normalizeRegulation(regulationRaw)}:noart`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const regChunk = chunks.find(
      (c) => normalizeRegulation(c.metadata.regulation) === normalizeRegulation(regulationRaw)
    );

    if (regChunk) {
      citations.push({
        id: `cite-${citations.length}`,
        regulation: regChunk.metadata.regulation,
        article: regChunk.metadata.article !== "Unknown" ? regChunk.metadata.article : "",
        celex_id: regChunk.metadata.celex_id,
        eurlex_url: buildEurlexUrl(regChunk.metadata.celex_id),
        chunk_content: regChunk.content,
        similarity: regChunk.similarity,
      });
    }
  }

  return citations;
}
