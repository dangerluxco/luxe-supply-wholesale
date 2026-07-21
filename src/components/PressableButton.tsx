"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { clsx } from "@/lib/clsx";
import { pressableClass } from "@/lib/pressable";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** In-flight async / transition — disables and shows pendingLabel when set. */
  pending?: boolean;
  /** Label while pending (e.g. "Saving…", "Opening…"). Falls back to children. */
  pendingLabel?: ReactNode;
};

/**
 * Shared button with immediate press + pending/disabled feedback.
 * Use for primary/secondary CTAs; opt out of global press via className "no-press".
 */
export function PressableButton({
  pending = false,
  pendingLabel,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: Props) {
  const busy = Boolean(pending);
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={clsx(pressableClass(busy), className)}
      {...rest}
    >
      {busy && pendingLabel != null ? pendingLabel : children}
    </button>
  );
}
