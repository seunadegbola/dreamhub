"use client";

import { useEffect, useRef } from "react";
import { IconClose } from "./icons";

export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-2xl" : "max-w-lg"} rounded-[14px] border-2 border-ink bg-surface p-0 text-ink shadow-brut backdrop:bg-ink/40`}
    >
      {open && (
        <div className="rise p-5 md:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-xl font-bold tracking-tight">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="-m-1 rounded p-1 hover:bg-haze/50">
              <IconClose />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
