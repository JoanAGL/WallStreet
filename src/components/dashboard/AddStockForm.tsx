"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  currentCount: number;
  maxCount?: number;
}

export default function AddStockForm({ currentCount, maxCount = 5 }: Props) {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isFull = currentCount >= maxCount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker.trim() || isFull) return;

    setError(null);
    setLoading(true);

    const res = await fetch("/api/stocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: ticker.trim().toUpperCase() }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Error al añadir la acción");
      return;
    }

    setTicker("");
    router.refresh();
  }

  if (isFull) {
    return (
      <p className="text-sm text-gray-500 italic">
        Límite alcanzado ({maxCount}/{maxCount} acciones).
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2">
      <div className="flex-1">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="Ej: AAPL, MSFT, TSLA"
          maxLength={10}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {error && (
          <p className="text-xs text-red-600 mt-1">{error}</p>
        )}
      </div>
      <button
        type="submit"
        disabled={loading || !ticker.trim()}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
      >
        {loading ? "Añadiendo..." : "Añadir"}
      </button>
    </form>
  );
}
