"use client";

import * as React from "react";
import { Sidebar } from "@/components/sidebar";
import { ChatContainer } from "@/components/chat/chat-container";

/**
 * Client wrapper that manages regulation selection state
 * and lays out sidebar + chat area.
 */
export function ChatLayout() {
  const [selectedRegulation, setSelectedRegulation] = React.useState<
    string | null
  >(null);

  return (
    <div className="flex flex-1 overflow-hidden">
      <Sidebar
        selectedRegulation={selectedRegulation}
        onSelectRegulation={setSelectedRegulation}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <ChatContainer selectedRegulation={selectedRegulation} />
      </div>
    </div>
  );
}
