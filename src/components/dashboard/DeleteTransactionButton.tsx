"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  transactionId: string;
}

export default function DeleteTransactionButton({ transactionId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm("¿Eliminar esta venta del historial? Los cálculos WAC se recalcularán automáticamente.")) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/portfolio/transactions/${transactionId}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Error al eliminar.");
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40 text-xs px-1"
        title="Eliminar esta transacción de venta"
        aria-label="Eliminar venta"
      >
        {isPending ? "…" : "✕"}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </span>
  );
}
