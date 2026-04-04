import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Link,
} from "@react-pdf/renderer";
import type { ChatMessage, Citation } from "@/types/legal";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const COLORS = {
  headerBg: "#1e293b",
  headerText: "#ffffff",
  bodyText: "#334155",
  labelUser: "#0f766e",
  labelAssistant: "#4338ca",
  muted: "#64748b",
  border: "#e2e8f0",
  accentBg: "#f8fafc",
  linkColor: "#2563eb",
  tagBg: "#e0f2fe",
  tagText: "#0369a1",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 50,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: COLORS.bodyText,
    lineHeight: 1.5,
  },

  // Header
  header: {
    backgroundColor: COLORS.headerBg,
    borderRadius: 4,
    padding: 16,
    marginBottom: 20,
  },
  headerTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    color: COLORS.headerText,
    marginBottom: 4,
  },
  headerMeta: {
    fontSize: 9,
    color: COLORS.muted,
  },

  // Section title
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    color: COLORS.headerBg,
    marginTop: 20,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    borderBottomStyle: "solid",
    paddingBottom: 4,
  },

  // Query block (user question)
  queryBlock: {
    backgroundColor: COLORS.accentBg,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.labelUser,
    borderLeftStyle: "solid",
    padding: 10,
    marginBottom: 10,
  },
  queryLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: COLORS.labelUser,
    marginBottom: 3,
    textTransform: "uppercase",
  },
  queryText: {
    fontSize: 10,
    lineHeight: 1.5,
  },

  // Answer block
  answerBlock: {
    marginBottom: 10,
  },
  answerText: {
    fontSize: 10,
    lineHeight: 1.6,
    textAlign: "justify",
  },

  // Compact citation tags (inline-style)
  citationsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
    marginBottom: 12,
  },
  citationTag: {
    backgroundColor: COLORS.tagBg,
    color: COLORS.tagText,
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },

  // Compact sources table (only at end of document)
  sourcesHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    borderBottomStyle: "solid",
    paddingBottom: 2,
    marginBottom: 2,
  },
  sourcesHeaderCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  sourceRow: {
    flexDirection: "row",
    paddingVertical: 2,
  },
  sourceCell: {
    fontSize: 7,
    color: COLORS.bodyText,
  },
  sourceLink: {
    fontSize: 7,
    color: COLORS.linkColor,
  },

  // Column widths for sources table
  colReg: { flex: 2 },
  colArt: { flex: 1.5 },
  colLink: { flex: 2 },

  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderTopStyle: "solid",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: COLORS.muted,
  },
  disclaimer: {
    position: "absolute",
    bottom: 38,
    left: 48,
    right: 48,
    fontSize: 7,
    color: COLORS.muted,
    fontStyle: "italic",
    textAlign: "center",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderTopStyle: "solid",
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Strip citation markers from text for clean display.
 */
function stripCitations(text: string): string {
  return text.replace(/\[\[([A-Za-z\s]+?)\s*-?\s*(?:Article\s+\d+)?\]\]/g, "").replace(/\s{2,}/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface ChatPDFDocumentProps {
  messages: ChatMessage[];
}

export function ChatPDFDocument({ messages }: ChatPDFDocumentProps) {
  const exportDate = formatDate(Date.now());

  // Extract Q&A pairs (user message → assistant response)
  const qaPairs: Array<{ question: string; answer: string; citations: Citation[] }> = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "user") {
      const answer = messages[i + 1]?.role === "assistant" ? messages[i + 1] : null;
      if (answer) {
        qaPairs.push({
          question: messages[i].content,
          answer: answer.content,
          citations: answer.citations ?? [],
        });
      }
    }
  }

  // Collect all unique citations across all answers
  const allCitations = messages
    .filter((m) => m.role === "assistant" && m.citations && m.citations.length > 0)
    .flatMap((m) => m.citations!);

  const seen = new Set<string>();
  const uniqueCitations = allCitations.filter((c) => {
    const key = `${c.regulation}:${c.article}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <Document
      title="EuroLex AI — Legal Research Report"
      author="EuroLex AI"
    >
      <Page size="A4" style={styles.page} wrap>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>EuroLex AI — Legal Research Report</Text>
          <Text style={styles.headerMeta}>Generated {exportDate} · {qaPairs.length} queries · {uniqueCitations.length} sources cited</Text>
        </View>

        {/* Q&A Sections */}
        {qaPairs.map((pair, i) => (
          <View key={i} wrap={false}>
            {/* Query */}
            <View style={styles.queryBlock}>
              <Text style={styles.queryLabel}>Query {i + 1}</Text>
              <Text style={styles.queryText}>{pair.question}</Text>
            </View>

            {/* Answer */}
            <View style={styles.answerBlock}>
              <Text style={styles.answerText}>{stripCitations(pair.answer)}</Text>
            </View>

            {/* Compact citation tags (no table per answer) */}
            {pair.citations.length > 0 && (
              <View style={styles.citationsRow}>
                {pair.citations.map((c, j) => (
                  <Text key={j} style={styles.citationTag}>
                    {c.regulation} — {c.article}
                  </Text>
                ))}
              </View>
            )}
          </View>
        ))}

        {/* All unique sources summary — compact table */}
        {uniqueCitations.length > 0 && (
          <View wrap>
            <Text style={styles.sectionTitle}>All Cited Sources ({uniqueCitations.length})</Text>
            <View style={styles.sourcesHeader}>
              <Text style={[styles.sourcesHeaderCell, styles.colReg]}>Regulation</Text>
              <Text style={[styles.sourcesHeaderCell, styles.colArt]}>Article</Text>
              <Text style={[styles.sourcesHeaderCell, styles.colLink]}>Source</Text>
            </View>
            {uniqueCitations.map((c, i) => (
              <View key={i} style={styles.sourceRow}>
                <Text style={[styles.sourceCell, styles.colReg]}>{c.regulation}</Text>
                <Text style={[styles.sourceCell, styles.colArt]}>{c.article}</Text>
                <Text style={[styles.colLink]}>
                  {c.eurlex_url ? (
                    <Link src={c.eurlex_url} style={styles.sourceLink}>
                      View on EUR-Lex →
                    </Link>
                  ) : (
                    <Text style={styles.sourceCell}>—</Text>
                  )}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          This document is auto-generated by EuroLex AI. It does not constitute legal advice.
          Always verify information against official sources on EUR-Lex (eur-lex.europa.eu).
        </Text>

        {/* Page number */}
        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
