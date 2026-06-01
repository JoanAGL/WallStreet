"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  /** Full API path to DELETE, e.g. /api/portfolio/transactions/:id or /api/portfolio/history/manual/:id */
  deleteUrl:     string;
  confirmMessage?: string;
}

export default function DeleteTransactionButton({ deleteUrl, confirmMessage }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    const msg = confirmMessage ?? "¿Eliminar esta entrada del historial? Esta acción no se puede deshacer.";
    if (!confirm(msg)) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(deleteUrl, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Error al eliminar.");
      }
    });
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
      <button
        onClick={handleDelete}
        disabled={isPending}
        style={{ color: "var(--fg-5)", fontSize: 13, padding: "0 4px", background: "none", border: 0, cursor: "pointer", transition: "color .15s", opacity: isPending ? .4 : 1 }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#F87171")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--fg-5)")}
        title="Eliminar"
        aria-label="Eliminar entrada"
      >
        {isPending ? "…" : "✕"}
      </button>
      {error && <span style={{ fontSize: 11, color: "#F87171" }}>{error}</span>}
    </span>
  );
}
