"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { SearchSuggestion } from "@/app/api/search/route";

interface Props {
  currentCount: number;
  maxCount?: number;
}

const POPULAR = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "TSLA", "META", "JPM"];

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function AddStockForm({ currentCount, maxCount = 5 }: Props) {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isFull = currentCount >= maxCount;
  const debouncedTicker = useDebounce(ticker, 300);

  useEffect(() => {
    if (debouncedTicker.length < 2) { setSuggestions([]); return; }
    setLoadingSuggestions(true);
    fetch(`/api/search?q=${encodeURIComponent(debouncedTicker)}`)
      .then((r) => r.json())
      .then((d) => { setSuggestions(d.suggestions ?? []); setShowDropdown(true); })
      .catch(() => setSuggestions([]))
      .finally(() => setLoadingSuggestions(false));
  }, [debouncedTicker]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const submitTicker = useCallback(async (value: string) => {
    const normalized = value.trim().toUpperCase();
    if (!normalized || isFull) return;
    setError(null);
    setLoading(true);
    setShowDropdown(false);

    const res = await fetch("/api/stocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: normalized }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) { setError(data.error ?? "Error al añadir la acción"); return; }
    setTicker("");
    setSuggestions([]);
    router.refresh();
  }, [isFull, router]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, -1)); }
    if (e.key === "Enter" && activeIndex >= 0) { e.preventDefault(); submitTicker(suggestions[activeIndex].ticker); }
    if (e.key === "Escape") { setShowDropdown(false); setActiveIndex(-1); }
  }

  if (isFull) {
    return <p className="text-sm text-gray-500 italic">Límite alcanzado ({maxCount}/{maxCount} acciones).</p>;
  }

  return (
    <div ref={containerRef} className="space-y-2">
      <form onSubmit={(e) => { e.preventDefault(); submitTicker(ticker); }} className="flex items-start gap-2">
        <div className="flex-1 relative">
          <input
            value={ticker}
            onChange={(e) => { setTicker(e.target.value.toUpperCase()); setActiveIndex(-1); setShowDropdown(true); }}
            onFocus={() => { if (ticker.length >= 2) setShowDropdown(true); }}
            onKeyDown={handleKeyDown}
            placeholder="Ej: AAPL, MSFT, TSLA"
            maxLength={10}
            autoComplete="off"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {showDropdown && ticker.length >= 2 && (
            <ul
              role="listbox"
              className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-56 overflow-y-auto"
            >
              {loadingSuggestions ? (
                <li className="px-3 py-2 text-sm text-gray-400">Buscando...</li>
              ) : suggestions.length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-400">Sin resultados para «{ticker}»</li>
              ) : (
                suggestions.map((s, i) => (
                  <li
                    key={s.ticker}
                    role="option"
                    aria-selected={i === activeIndex}
                    onMouseDown={(e) => { e.preventDefault(); submitTicker(s.ticker); }}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer text-sm ${i === activeIndex ? "bg-blue-50" : "hover:bg-gray-50"}`}
                  >
                    <span>
                      <span className="font-semibold text-gray-900">{s.ticker}</span>
                      <span className="ml-2 text-gray-500 truncate max-w-[160px] inline-block align-bottom">{s.name}</span>
                    </span>
                    {s.exchange && (
                      <span className="ml-2 text-xs text-gray-400 shrink-0">{s.exchange}</span>
                    )}
                  </li>
                ))
              )}
            </ul>
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

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Popular tickers (shown when input is empty) */}
      {ticker.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {POPULAR.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => submitTicker(t)}
              disabled={loading}
              className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors disabled:opacity-50"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
