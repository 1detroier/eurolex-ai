"use client";

import * as React from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/types/legal";

interface PDFExportProps {
  messages: ChatMessage[];
}

export function PDFExport({ messages }: PDFExportProps) {
  const [generating, setGenerating] = React.useState(false);
  const hasMessages = messages.length > 0;

  const handleExport = React.useCallback(async () => {
    if (!hasMessages || generating) return;
    setGenerating(true);

    try {
      // Dynamic imports — both modules only load on client
      const { pdf } = await import("@react-pdf/renderer");
      const { ChatPDFDocument } = await import("@/components/chat/pdf-document");

      const blob = await pdf(<ChatPDFDocument messages={messages} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `eurolex-ai-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setGenerating(false);
    }
  }, [messages, hasMessages, generating]);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!hasMessages || generating}
      onClick={handleExport}
    >
      <FileDown className="mr-2 h-4 w-4" />
      {generating ? "Generating…" : "Export PDF"}
    </Button>
  );
}
