import { LegalDisclaimer } from "@/components/legal-disclaimer";
import { ChatLayout } from "@/components/chat/chat-layout";

export default function Home() {
  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="shrink-0 border-b bg-background px-4 py-4 sm:py-6 md:pl-[calc(16rem+1rem)]">
        <div className="mx-auto max-w-[800px] text-center">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            EuroLex AI
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your AI-powered assistant for European Union law
          </p>
        </div>
      </header>

      {/* Legal disclaimer banner */}
      <LegalDisclaimer />

      {/* Sidebar + Chat area */}
      <main className="flex flex-1 overflow-hidden">
        <ChatLayout />
      </main>

      {/* Footer */}
      <footer className="shrink-0 border-t px-4 py-3 text-center text-xs text-muted-foreground md:pl-[calc(16rem+1rem)]">
        <p>
          EuroLex AI uses AI to retrieve and summarize EU legislation. Responses
          are informational only and do not constitute legal advice. Always
          consult a qualified professional.
        </p>
      </footer>
    </div>
  );
}
