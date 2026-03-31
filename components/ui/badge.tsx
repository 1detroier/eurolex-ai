/**
 * Badge component — Factorial F0 style
 * Source: https://github.com/factorialco/f0/blob/main/packages/react/src/ui/badge.tsx
 *
 * Adapted to use our CSS variable naming (hsl(var(--...))) instead of Factorial's f1-* classes.
 */
import { cn } from "@/lib/utils";

const badgeVariants = {
  default:
    "border-border bg-transparent text-foreground",
  neutral:
    "border-transparent bg-[hsl(var(--neutral-10))] text-foreground",
  accent:
    "border-transparent bg-[hsl(var(--accent-50)/0.1)] text-[hsl(var(--accent-60))]",
  critical:
    "border-transparent bg-[hsl(var(--critical-50)/0.1)] text-[hsl(var(--critical-70))]",
  positive:
    "border-transparent bg-[hsl(var(--positive-50)/0.1)] text-[hsl(var(--positive-70))]",
  warning:
    "border-transparent bg-[hsl(var(--warning-50)/0.1)] text-[hsl(var(--warning-50))]",
  info:
    "border-transparent bg-[hsl(var(--info-50)/0.1)] text-[hsl(var(--info-70))]",
} as const;

type BadgeVariant = keyof typeof badgeVariants;

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-solid px-2.5 py-0.5 text-xs font-medium transition-colors",
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
export type { BadgeVariant };
