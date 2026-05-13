"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UPDATE_TYPE_LABELS, UPDATE_TYPE_DESCRIPTIONS } from "@/types/updateTypes";
import type { UpdateType } from "@/types/updateTypes";

const OPTIONS: { type: UpdateType; label: string; description: string }[] = [
  { type: "price",      label: UPDATE_TYPE_LABELS.price,      description: UPDATE_TYPE_DESCRIPTIONS.price },
  { type: "news",       label: UPDATE_TYPE_LABELS.news,        description: UPDATE_TYPE_DESCRIPTIONS.news },
  { type: "technicals", label: UPDATE_TYPE_LABELS.technicals,  description: UPDATE_TYPE_DESCRIPTIONS.technicals },
  { type: "ai",         label: UPDATE_TYPE_LABELS.ai,          description: UPDATE_TYPE_DESCRIPTIONS.ai },
];

interface Props {
  ticker: string;
}

export default function StockUpdateMenu({ ticker }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<UpdateType>>(new Set<UpdateType>(["price"]));
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  function toggle(type: UpdateType) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        // Keep at least one selected
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  async function handleApply() {
    setFeedback(null);
    const types = Array.from(selected);

    startTransition(async () => {
      const res = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: [ticker], types }),
      });
      const data = await res.json() as { error?: string; succeeded?: number; failed?: unknown[] };

      if (!res.ok) {
        setFeedback({ ok: false, msg: data.error ?? "Error al actualizar." });
        return;
      }

      const failed = Array.isArray(data.failed) ? data.failed.length : 0;
      if (failed > 0) {
        setFeedback({ ok: false, msg: "Actualización parcialmente fallida." });
      } else {
        setFeedback({ ok: true, msg: "Actualizado correctamente." });
        setTimeout(() => { setFeedback(null); setIsOpen(false); }, 1500);
      }
      router.refresh();
    });
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => { setIsOpen((v) => !v); setFeedback(null); }}
        title="Actualizar datos de esta acción"
        className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        aria-label="Menú de actualización"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-7 z-20 w-56 bg-white border border-gray-200 rounded-xl shadow-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-700 pb-1 border-b border-gray-100">
            Actualizar {ticker}
          </p>

          <div className="space-y-1.5">
            {OPTIONS.map(({ type, label, description }) => (
              <label
                key={type}
                className="flex items-start gap-2 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={selected.has(type)}
                  onChange={() => toggle(type)}
                  className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-700 group-hover:text-blue-700 leading-tight">
                    {label}
                  </p>
                  <p className="text-xs text-gray-400 leading-tight">{description}</p>
                </div>
              </label>
            ))}
          </div>

          {feedback && (
            <p className={`text-xs px-2 py-1 rounded ${feedback.ok ? "text-green-700 bg-green-50" : "text-red-600 bg-red-50"}`}>
              {feedback.msg}
            </p>
          )}

          <div className="flex gap-2 pt-1 border-t border-gray-100">
            <button
              onClick={handleApply}
              disabled={isPending || selected.size === 0}
              className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {isPending ? (
                <>
                  <span className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Actualizando…</span>
                </>
              ) : "Aplicar"}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
