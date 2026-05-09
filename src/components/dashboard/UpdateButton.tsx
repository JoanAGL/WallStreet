"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  lastUpdatedAt?: string | null;
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "hace menos de 1 minuto";
  if (mins === 1) return "hace 1 minuto";
  if (mins < 60) return `hace ${mins} minutos`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return "hace 1 hora";
  if (hours < 24) return `hace ${hours} horas`;
  return `hace ${Math.floor(hours / 24)} días`;
}

export default function UpdateButton({ lastUpdatedAt }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleUpdate() {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const res = await fetch("/api/update", { method: "POST" });
    const data = await res.json();

    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Error al actualizar");
      return;
    }

    setSuccessMsg(
      `${data.succeeded} acción${data.succeeded !== 1 ? "es" : ""} actualizada${data.succeeded !== 1 ? "s" : ""} correctamente.`
    );
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          onClick={handleUpdate}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Actualizando...
            </>
          ) : (
            <>
              <span aria-hidden="true">↻</span>
              Actualizar datos
            </>
          )}
        </button>

        {lastUpdatedAt && (
          <span className="text-xs text-gray-500">
            Última actualización: {formatRelativeTime(lastUpdatedAt)}
          </span>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-1.5">
          {error}
        </p>
      )}

      {successMsg && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-1.5">
          {successMsg}
        </p>
      )}
    </div>
  );
}
