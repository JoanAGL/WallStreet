"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InvestmentHorizon } from "@/types/models";

interface Props {
  ticker: string;
  current: InvestmentHorizon;
}

const OPTIONS: { value: InvestmentHorizon; label: string; short: string }[] = [
  { value: "SHORT_TERM",  label: "Corto Plazo",  short: "Corto" },
  { value: "MEDIUM_TERM", label: "Medio Plazo",  short: "Medio" },
  { value: "LONG_TERM",   label: "Largo Plazo",  short: "Largo" },
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

    if (res.ok) {
      startTransition(() => router.refresh());
    } else {
      setSelected(current);
    }
  }

  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
      {OPTIONS.map((opt) => {
        const active = selected === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => handleSelect(opt.value)}
            disabled={isPending}
            title={opt.label}
            className={`px-2.5 py-1 transition-colors ${
              active
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-500 hover:bg-gray-50"
            } ${isPending ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
          >
            {opt.short}
          </button>
        );
      })}
    </div>
  );
}
