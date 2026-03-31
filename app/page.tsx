import { LegalDisclaimer } from "@/components/legal-disclaimer";
import { ChatLayout } from "@/components/chat/chat-layout";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-background">
        <div className="flex h-14 items-center justify-between px-4 md:pl-64">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
              EL
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight text-foreground">
                EuroLex AI
              </h1>
              <p className="text-xs text-muted-foreground">
                European legislation assistant
              </p>
            </div>
          </div>

          <ThemeToggle />
        </div>
      </header>

      {/* Legal disclaimer banner */}
      <LegalDisclaimer />

      {/* Sidebar + Chat area */}
      <main className="flex flex-1 overflow-hidden">
        <ChatLayout />
      </main>
    </div>
  );
}
