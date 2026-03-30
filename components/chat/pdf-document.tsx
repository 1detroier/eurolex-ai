import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ChatMessage } from "@/types/legal";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const COLORS = {
  headerBg: "#1e293b",
  headerText: "#ffffff",
  bodyText: "#334155",
  labelUser: "#0f766e",
  labelAssistant: "#4338ca",
  citationBorder: "#94a3b8",
  muted: "#64748b",
  border: "#e2e8f0",
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

  // Header -----------------------------------------------------------------
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

  // Messages ---------------------------------------------------------------
  messageBlock: {
    marginBottom: 14,
  },
  roleLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    marginBottom: 3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  messageContent: {
    fontSize: 10,
    lineHeight: 1.6,
    textAlign: "justify",
  },

  // Citations --------------------------------------------------------------
  citationsSection: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderTopStyle: "solid",
    paddingTop: 6,
  },
  citationsTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  citationItem: {
    fontSize: 8,
    color: COLORS.muted,
    marginBottom: 2,
  },

  // Footer -----------------------------------------------------------------
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
    bottom: 30,
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface ChatPDFDocumentProps {
  messages: ChatMessage[];
}

export function ChatPDFDocument({ messages }: ChatPDFDocumentProps) {
  const exportDate = formatDate(Date.now());

  // Collect all unique citations across assistant messages
  const allCitations = messages
    .filter((m) => m.role === "assistant" && m.citations && m.citations.length > 0)
    .flatMap((m) => m.citations!);

  // Deduplicate by regulation:article
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
          <Text style={styles.headerMeta}>Generated {exportDate}</Text>
        </View>

        {/* Messages */}
        {messages.map((msg, i) => {
          const isUser = msg.role === "user";
          const roleLabel = isUser ? "You" : "EuroLex AI";
          const labelColor = isUser ? COLORS.labelUser : COLORS.labelAssistant;

          return (
            <View key={`${msg.timestamp}-${i}`} style={styles.messageBlock} wrap>
              <Text style={[styles.roleLabel, { color: labelColor }]}>
                {roleLabel}
              </Text>
              <Text style={styles.messageContent}>{msg.content}</Text>

              {/* Inline citations per assistant message */}
              {!isUser && msg.citations && msg.citations.length > 0 && (
                <View style={styles.citationsSection}>
                  <Text style={styles.citationsTitle}>Cited Sources</Text>
                  {msg.citations.map((c) => (
                    <Text key={c.id} style={styles.citationItem}>
                      • {c.regulation} — {c.article} (CELEX: {c.celex_id})
                    </Text>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* Disclaimer (absolute, repeated via fixed position) */}
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
