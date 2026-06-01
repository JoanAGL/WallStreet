"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InvestmentHorizon } from "@/types/models";

interface Props {
  ticker: string;
  current: InvestmentHorizon;
}

const OPTIONS: { value: InvestmentHorizon; short: string }[] = [
  { value: "SHORT_TERM",  short: "Corto" },
  { value: "MEDIUM_TERM", short: "Medio" },
  { value: "LONG_TERM",   short: "Largo" },
];

export default function HorizonSelector({ ticker, current }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<InvestmentHorizon>(current);
  const [isPending, startTransition] = useTransition();

  async function handleSelect(value: InvestmentHorizon) {
    if (value === selected || isPending) return;
    setSelected(value);
    const res = await fetch(`/api/stocks/${ticker}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ investmentHorizon: value }),
    });
    if (res.ok) startTransition(() => router.refresh());
    else setSelected(current);
  }

  return (
    <div style={{ display: "flex", gap: 6 }}>
      {OPTIONS.map((opt) => {
        const active = selected === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => handleSelect(opt.value)}
            disabled={isPending}
            style={{
              flex: 1, padding: "6px 4px", fontSize: 12, fontWeight: 500,
              borderRadius: 7, cursor: isPending ? "wait" : "pointer",
              border: `1px solid ${active ? "var(--brand-soft)" : "var(--card-border)"}`,
              background: active ? "rgba(37,99,235,.18)" : "var(--card-inner)",
              color: active ? "#93C5FD" : "var(--fg-4)",
              opacity: isPending ? 0.6 : 1,
              transition: "all .15s",
            }}
          >
            {opt.short}
          </button>
        );
      })}
    </div>
  );
}
