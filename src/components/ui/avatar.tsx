import { useState } from "react";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

/** A person's photo when there is one (features/photos), else their initials. */
export const Avatar = ({
  name,
  photo,
  size = 32,
  className,
}: {
  name: string;
  photo?: string;
  size?: number;
  className?: string;
}) => {
  // A photo that does not load (removed meanwhile, offline) falls back to the initials.
  const [failed, setFailed] = useState<string | null>(null);
  const shown = photo && failed !== photo ? photo : undefined;
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size / 3)) }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-subtle font-semibold",
        className,
      )}
    >
      {shown ? (
        <img
          src={shown}
          alt=""
          draggable={false}
          onError={() => setFailed(shown)}
          className="size-full object-cover"
        />
      ) : (
        initials(name)
      )}
    </span>
  );
};
