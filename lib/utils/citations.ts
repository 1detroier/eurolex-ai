/**
 * Citation parser — extracts [[REGULATION-Article N]] and [[REGULATION]] markers
 * from LLM responses and maps them to EUR-Lex URLs using the retrieved chunks.
 *
 * Uses double square brackets to avoid conflicts with legal text parentheticals.
 */
import type { Citation, LegalChunk } from "@/types/legal";

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/** Matches [[Regulation - Article N]] with sub-paragraphs: 5, 5(1), 5(a), 5-1, 5-1(a) */
const CITATION_WITH_ARTICLE_REGEX = /\[\[([A-Za-z\s]+?)\s*-\s*Article\s+(\d+(?:[\(\-][\da-z]+[\)]?){0,3})\]\]/gi;

/** Matches [[Regulation]] (no article) */
const CITATION_NO_ARTICLE_REGEX = /\[\[([A-Za-z][A-Za-z\s]+?)\]\]/g;

/** Known regulation names */
const KNOWN_REGULATIONS = ["gdpr", "ai act", "digital services act", "digital markets act", "nis2 directive", "cyber resilience act"];

/** Extract article number from metadata */
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

export function parseCitations(text: string, chunks: LegalChunk[]): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;

  // ── Parse [[Regulation-Article N]] citations ──
  CITATION_WITH_ARTICLE_REGEX.lastIndex = 0;

  while ((match = CITATION_WITH_ARTICLE_REGEX.exec(text)) !== null) {
    const regulationRaw = match[1].trim();
    const articleNumber = match[2];

    // Skip malformed
    if (!/^\d+$/.test(articleNumber)) continue;

    const dedupeKey = `${normalizeRegulation(regulationRaw)}:art${articleNumber}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const matchedChunk = chunks.find((chunk) => {
      const chunkReg = normalizeRegulation(chunk.metadata.regulation);
      const citeReg = normalizeRegulation(regulationRaw);
      const chunkArtNum = extractArticleNumber(chunk.metadata.article);
      return chunkReg === citeReg && chunkArtNum === articleNumber;
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

  // ── Parse [[Regulation]] citations without article ──
  CITATION_NO_ARTICLE_REGEX.lastIndex = 0;

  while ((match = CITATION_NO_ARTICLE_REGEX.exec(text)) !== null) {
    const regulationRaw = match[1].trim();
    if (!isKnownRegulation(regulationRaw)) continue;

    const dedupeKey = `${normalizeRegulation(regulationRaw)}:noart`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    // Try to find a chunk with a known article first, then any chunk
    const regChunk = chunks.find(
      (c) => normalizeRegulation(c.metadata.regulation) === normalizeRegulation(regulationRaw)
        && c.metadata.article !== "Unknown"
    ) ?? chunks.find(
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
