"use client";

import * as React from "react";
import {
  Shield,
  Cpu,
  Globe,
  Building2,
  Filter,
  X,
  Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Regulation definitions
// ---------------------------------------------------------------------------

interface Regulation {
  name: string;
  celexId: string;
  icon: React.ComponentType<{ className?: string }>;
}

const REGULATIONS: Regulation[] = [
  {
    name: "GDPR",
    celexId: "32016R0679",
    icon: Shield,
  },
  {
    name: "AI Act",
    celexId: "52021PC0206",
    icon: Cpu,
  },
  {
    name: "Digital Services Act",
    celexId: "32022R2065",
    icon: Globe,
  },
  {
    name: "Digital Markets Act",
    celexId: "32022R1925",
    icon: Building2,
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SidebarProps {
  selectedRegulation: string | null;
  onSelectRegulation: (regulation: string | null) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Sidebar({
  selectedRegulation,
  onSelectRegulation,
  className,
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const handleSelect = React.useCallback(
    (regulation: string | null) => {
      onSelectRegulation(regulation);
      setMobileOpen(false); // Close mobile menu on selection
    },
    [onSelectRegulation]
  );

  return (
    <>
      {/* ── Mobile toggle button (fixed in header area) ── */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed left-3 top-3 z-50 md:hidden"
        onClick={() => setMobileOpen((prev) => !prev)}
        aria-label={mobileOpen ? "Close sidebar" : "Open sidebar"}
      >
        {mobileOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <Filter className="h-5 w-5" />
        )}
      </Button>

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar panel ── */}
      <aside
        className={cn(
          // Base layout
          "flex h-full w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground",
          // Desktop: always visible, sticky
          "md:sticky md:top-0 md:block",
          // Mobile: slide in from left, overlay
          "fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b px-4 py-4">
          <Scale className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-semibold tracking-tight">
            Regulations
          </span>
        </div>

        {/* Regulation list */}
        <nav className="flex-1 overflow-y-auto p-2">
          {/* All Regulations */}
          <button
            onClick={() => handleSelect(null)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
              selectedRegulation === null
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}
          >
            <Filter className="h-4 w-4 shrink-0" />
            <div className="flex flex-col">
              <span className="font-medium">All Regulations</span>
              <span className="text-xs text-muted-foreground">
                Search across all EU laws
              </span>
            </div>
          </button>

          {/* Divider */}
          <div className="my-2 h-px bg-sidebar-border" />

          {/* Individual regulations */}
          {REGULATIONS.map((reg) => {
            const Icon = reg.icon;
            const isSelected = selectedRegulation === reg.name;

            return (
              <button
                key={reg.celexId}
                onClick={() => handleSelect(reg.name)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                  isSelected
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isSelected
                      ? "text-sidebar-primary"
                      : "text-muted-foreground"
                  )}
                />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">{reg.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {reg.celexId}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {selectedRegulation
              ? `Filtering: ${selectedRegulation}`
              : "No filter active"}
          </p>
        </div>
      </aside>
    </>
  );
}
