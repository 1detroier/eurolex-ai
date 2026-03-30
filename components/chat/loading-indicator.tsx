"use client";

export function LoadingIndicator() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-1">
        <span className="sr-only">EuroLex AI is thinking...</span>
        <div className="flex gap-1">
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]"
            aria-hidden="true"
          />
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]"
            aria-hidden="true"
          />
          <span
            className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]"
            aria-hidden="true"
          />
        </div>
      </div>
      <span className="text-sm text-muted-foreground">
        EuroLex AI is thinking...
      </span>
    </div>
  );
}
