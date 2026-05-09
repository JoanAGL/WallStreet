"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RemoveStockButton({ ticker }: { ticker: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    if (!confirm(`¿Eliminar ${ticker} de tu lista?`)) return;
    setLoading(true);

    await fetch(`/api/stocks/${ticker}`, { method: "DELETE" });
    router.refresh();
    setLoading(false);
  }

  return (
    <button
      onClick={handleRemove}
      disabled={loading}
      title={`Eliminar ${ticker}`}
      className="text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors text-lg leading-none"
    >
      ✕
    </button>
  );
}
