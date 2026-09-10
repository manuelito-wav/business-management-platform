"use client";

import { useEffect, useRef, type ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Thin wrapper around the native <dialog> element rather than a
 * Radix/shadcn dependency: <dialog> already provides focus trapping,
 * Escape-to-close, and a backdrop for free, which is enough for this
 * checkpoint's forms (packages/ui stays empty for the same proportionality
 * reason lib/pos-cache left packages/contracts empty -- see ROADMAP.md
 * "add operational navigation and catalog screens").
 */
export function Dialog({ open, onClose, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    if (open && !node.open) {
      node.showModal();
    } else if (!open && node.open) {
      node.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      aria-label={title}
      className="w-full max-w-md rounded-lg border border-gray-200 p-0 backdrop:bg-black/30"
    >
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
