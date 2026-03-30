"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  maxLength?: number;
}

export function ChatInput({
  onSend,
  disabled = false,
  maxLength = 4000,
}: ChatInputProps) {
  const [value, setValue] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const charCount = value.length;
  const isNearLimit = charCount > maxLength * 0.8;
  const isOverLimit = charCount > maxLength;
  const isEmpty = value.trim().length === 0;
  const isDisabled = disabled || isEmpty || isOverLimit;

  const handleSubmit = React.useCallback(() => {
    if (isDisabled) return;
    onSend(value.trim());
    setValue("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [isDisabled, onSend, value]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleInput = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      if (newValue.length <= maxLength) {
        setValue(newValue);
      }
      // Auto-resize
      const textarea = e.target;
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    },
    [maxLength]
  );

  return (
    <div className="border-t bg-background p-3 sm:p-4">
      <div className="mx-auto flex max-w-[800px] flex-col gap-2">
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Ask about EU law (GDPR, AI Act, DSA, DMA)..."
            rows={1}
            className="max-h-40 min-h-[44px] resize-none"
            aria-label="Chat message input"
          />
          <Button
            onClick={handleSubmit}
            disabled={isDisabled}
            size="icon"
            className="shrink-0"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {isNearLimit && (
          <div
            className={`text-right text-xs ${
              isOverLimit ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {charCount} / {maxLength}
          </div>
        )}
      </div>
    </div>
  );
}
