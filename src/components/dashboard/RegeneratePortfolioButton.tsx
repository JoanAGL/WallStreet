"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";

export default function RegeneratePortfolioButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleRegenerate() {
    setFeedback(null);
    startTransition(async () => {
      const res = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ types: ["portfolio"] }),
      });
      const data = await res.json() as { error?: string };

      if (!res.ok) {
        setFeedback({ ok: false, msg: data.error ?? "Error al regenerar." });
        return;
      }
      setFeedback({ ok: true, msg: "Análisis global actualizado." });
      router.refresh();
      setTimeout(() => setFeedback(null), 2500);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleRegenerate}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-colors"
      >
        {isPending ? (
          <>
            <span className="h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Analizando…
          </>
        ) : (
          <>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Regenerar análisis
          </>
        )}
      </button>
      {feedback && (
        <span className={`text-xs ${feedback.ok ? "text-green-600" : "text-red-500"}`}>
          {feedback.msg}
        </span>
      )}
    </div>
  );
}
