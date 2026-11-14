import Link from "next/link";
import { cn } from "@unikit-bridge/ui";

export function RustraMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/brand/mark-r.svg"
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 rounded-[22%] object-cover", className)}
      aria-hidden
    />
  );
}

export function SiteBrand({
  href = "/",
  className,
  markSize = 28,
  wordmarkClassName,
}: {
  href?: string;
  className?: string;
  markSize?: number;
  wordmarkClassName?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "site-focusable inline-flex items-center gap-2.5 text-foreground",
        className,
      )}
    >
      <RustraMark size={markSize} />
      <span
        className={cn(
          "site-display font-semibold tracking-tight",
          wordmarkClassName ?? "text-lg",
        )}
      >
        rustra
      </span>
    </Link>
  );
}
