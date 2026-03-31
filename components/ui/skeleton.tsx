/**
 * Skeleton component — Factorial F0 style
 * Source: https://github.com/factorialco/f0/blob/main/packages/react/src/ui/skeleton.tsx
 *
 * Shows a pulsing placeholder while content loads.
 */
import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-[hsl(var(--neutral-10))]",
        className
      )}
      {...props}
    />
  );
}

/**
 * Skeleton text — multiple lines of skeleton placeholder.
 */
function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4",
            i === lines - 1 ? "w-3/4" : "w-full" // Last line is shorter
          )}
        />
      ))}
    </div>
  );
}

export { Skeleton, SkeletonText };
