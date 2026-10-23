import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

export const Avatar = ({
  name,
  size = 32,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) => (
  <span
    aria-hidden="true"
    style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size / 3)) }}
    className={cn(
      "inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-subtle font-semibold",
      className,
    )}
  >
    {initials(name)}
  </span>
);
