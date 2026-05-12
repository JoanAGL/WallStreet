"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  ticker: string;
  purchasePrice: number | null;
  quantity: number | null;
  purchaseDate: string | null; // ISO string
}

export default function PurchaseDataEditor({
  ticker,
  purchasePrice,
  quantity,
  purchaseDate,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);

  const [price, setPrice] = useState(purchasePrice != null ? String(purchasePrice) : "");
  const [qty, setQty] = useState(quantity != null ? String(quantity) : "");
  const [date, setDate] = useState(
    purchaseDate ? purchaseDate.slice(0, 10) : ""
  );
  const [error, setError] = useState<string | null>(null);

  const hasData = purchasePrice != null && quantity != null;

  async function handleSave() {
    setError(null);
    const parsedPrice = parseFloat(price);
    const parsedQty = parseFloat(qty);

    if (!price || isNaN(parsedPrice) || parsedPrice <= 0) {
      setError("Introduce un precio de compra válido.");
      return;
    }
    if (!qty || isNaN(parsedQty) || parsedQty <= 0) {
      setError("Introduce una cantidad válida.");
      return;
    }

    startTransition(async () => {
      await fetch(`/api/stocks/${ticker}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchasePrice: parsedPrice,
          quantity: parsedQty,
          purchaseDate: date || null,
        }),
      });
      router.refresh();
      setIsOpen(false);
    });
  }

  async function handleClear() {
    startTransition(async () => {
      await fetch(`/api/stocks/${ticker}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchasePrice: null, quantity: null, purchaseDate: null }),
      });
      setPrice("");
      setQty("");
      setDate("");
      router.refresh();
      setIsOpen(false);
    });
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
      >
        {hasData ? "Editar posición" : "+ Añadir mi posición"}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
      <p className="text-xs font-semibold text-gray-700">Mi posición</p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">Precio de compra ($)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="150.00"
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">Nº de acciones</label>
          <input
            type="number"
            min="0"
            step="0.001"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="10"
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-500 block mb-0.5">Fecha de compra (opcional)</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex-1 rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {isPending ? "Guardando…" : "Guardar"}
        </button>
        <button
          onClick={() => { setIsOpen(false); setError(null); }}
          disabled={isPending}
          className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >
          Cancelar
        </button>
        {hasData && (
          <button
            onClick={handleClear}
            disabled={isPending}
            className="rounded border border-red-200 px-3 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50"
          >
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}
