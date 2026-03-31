/**
 * Citation parser — extracts (REGULATION-Article N) markers from LLM responses
 * and maps them to EUR-Lex URLs using the retrieved chunks.
 */
import type { Citation, LegalChunk } from "@/types/legal";

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/**
 * Matches citation markers in LLM output:
 *   (GDPR-Article 17)
 *   (AI Act-Article 4)
 *   (Digital Services Act-Article 34)
 *
 * Captures: regulation name and article number.
 */
const CITATION_REGEX = /\(([A-Za-z\s]+?)-Article\s+(\d+)\)/gi;

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

function buildEurlexUrl(celexId: string, articleNumber: string): string {
  return `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celexId}#art_${articleNumber}`;
}

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
 * @param text - The LLM response text containing (Regulation-Article N) markers
 * @param chunks - The legal chunks used as context for this response
 * @returns Deduplicated Citation objects with EUR-Lex URLs
 */
export function parseCitations(text: string, chunks: LegalChunk[]): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<string>();

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
        article: `Article ${articleNumber}`,
        celex_id: matchedChunk.metadata.celex_id,
        eurlex_url: buildEurlexUrl(matchedChunk.metadata.celex_id, articleNumber),
        chunk_content: matchedChunk.content,
        similarity: matchedChunk.similarity,
      });
    } else {
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

/**
 * Replace citation markers in text with placeholder tokens for rendering.
 * Returns the text with markers replaced and the list of found citations.
 */
export function extractCitationMarkers(
  text: string
): { cleanText: string; markers: Array<{ start: number; end: number; regulation: string; article: string }> } {
  const markers: Array<{ start: number; end: number; regulation: string; article: string }> = [];
  
  let match: RegExpExecArray | null;
  CITATION_REGEX.lastIndex = 0;

  while ((match = CITATION_REGEX.exec(text)) !== null) {
    markers.push({
      start: match.index,
      end: match.index + match[0].length,
      regulation: match[1].trim(),
      article: match[2],
    });
  }

  return { cleanText: text, markers };
}
