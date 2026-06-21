"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  children,
  onClose,
  className = "max-w-md",
  ariaLabel,
  labelledById,
}: {
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
  /** Accessible name when no visible labelledById element is provided. */
  ariaLabel?: string;
  /** ID of a visible title element inside the modal (for aria-labelledby). */
  labelledById?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const fallbackLabelId = useId();
  const labelId = labelledById ?? (ariaLabel ? fallbackLabelId : undefined);

  useEffect(() => {
    const panel = panelRef.current;
    document.body.style.overflow = "hidden";

    const focusFirst = () => {
      const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable && focusable.length > 0) {
        focusable[0].focus();
      } else {
        panel?.focus();
      }
    };
    focusFirst();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose?.();
        return;
      }
      if (e.key !== "Tab" || !panel) return;

      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById ? labelledById : labelId}
        aria-label={labelledById || labelId ? undefined : ariaLabel}
        tabIndex={-1}
        className={`w-full rounded-cubino border border-white/[0.06] bg-den-surface shadow-den outline-none ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {ariaLabel && !labelledById && (
          <h2 id={fallbackLabelId} className="sr-only">
            {ariaLabel}
          </h2>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
