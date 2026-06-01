"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  stockId:         string;
  ticker:          string;
  availableShares: number;
  currentPrice:    number | null;
}

interface SellResultData {
  profitAmount:    number;
  profitPercentage: number;
  positionClosed:  boolean;
}

export default function SellStockModal({ stockId, ticker, availableShares, currentPrice }: Props) {
  const router = useRouter();

  const [open,    setOpen]    = useState(false);
  const [shares,  setShares]  = useState(String(availableShares));
  const [price,   setPrice]   = useState(currentPrice != null ? currentPrice.toFixed(2) : "");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [result,  setResult]  = useState<SellResultData | null>(null);

  const sharesNum = parseFloat(shares);
  const priceNum  = parseFloat(price);
  const canSubmit =
    isFinite(sharesNum) && sharesNum > 0 && sharesNum <= availableShares + 1e-9 &&
    isFinite(priceNum)  && priceNum  > 0;

  async function handleSell() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/sell", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ stockId, shares: sharesNum, price: priceNum }),
      });
      const data = await res.json() as {
        error?: string;
        operation?: { profitAmount: number; profitPercentage: number };
        positionClosed?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? "Error al procesar la venta.");
        return;
      }
      setResult({
        profitAmount:     data.operation!.profitAmount,
        profitPercentage: data.operation!.profitPercentage,
        positionClosed:   data.positionClosed ?? false,
      });
      router.refresh();
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setShares(String(availableShares));
    setPrice(currentPrice != null ? currentPrice.toFixed(2) : "");
    setError(null);
    setResult(null);
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
    setResult(null);
    setError(null);
  }

  const fmtUSD = (n: number) =>
    n.toLocaleString("es-ES", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={handleOpen}
        className="text-xs font-medium text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 rounded-lg px-3 py-1.5 transition-colors"
      >
        Vender
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">

            {result ? (
              /* ── Success state ── */
              <>
                <div className="text-center space-y-1">
                  <p className="text-2xl">✓</p>
                  <h3 className="text-base font-bold text-gray-900">Venta registrada</h3>
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2 text-sm">
                  <Row label="Profit" value={
                    <span className={result.profitAmount >= 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                      {result.profitAmount >= 0 ? "+" : ""}{fmtUSD(result.profitAmount)}
                    </span>
                  } />
                  <Row label="ROI operación" value={
                    <span className={result.profitPercentage >= 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                      {result.profitPercentage >= 0 ? "+" : ""}{result.profitPercentage.toFixed(2)}%
                    </span>
                  } />
                  {result.positionClosed && (
                    <p className="text-xs text-gray-500 pt-1 border-t border-gray-200 mt-2">
                      Posición cerrada — el activo se eliminó de tu cartera.
                    </p>
                  )}
                </div>

                <button
                  onClick={handleClose}
                  className="w-full rounded-xl bg-gray-900 text-white text-sm font-medium py-2.5 hover:bg-gray-700 transition-colors"
                >
                  Cerrar
                </button>
              </>
            ) : (
              /* ── Form state ── */
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-gray-900">Vender {ticker}</h3>
                  <button
                    onClick={handleClose}
                    className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                    aria-label="Cerrar"
                  >
                    ✕
                  </button>
                </div>

                <p className="text-xs text-gray-500">
                  Disponibles:{" "}
                  <span className="font-semibold text-gray-700">{availableShares} acciones</span>
                </p>

                <div className="space-y-3">
                  <Field label="Acciones a vender">
                    <input
                      type="number"
                      min={0.001}
                      max={availableShares}
                      step="any"
                      value={shares}
                      onChange={(e) => setShares(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </Field>
                  <Field label="Precio de venta (USD/acción)">
                    <input
                      type="number"
                      min={0.01}
                      step="any"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </Field>
                </div>

                {/* Preview */}
                {canSubmit && (
                  <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-600 space-y-1">
                    <Row label="Total recibido" value={
                      <span className="font-semibold text-gray-800">
                        {fmtUSD(sharesNum * priceNum)}
                      </span>
                    } />
                  </div>
                )}

                {error && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleClose}
                    disabled={loading}
                    className="flex-1 rounded-xl border border-gray-300 text-sm font-medium py-2.5 hover:bg-gray-50 transition-colors disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSell}
                    disabled={!canSubmit || loading}
                    className="flex-1 rounded-xl bg-red-600 text-white text-sm font-medium py-2.5 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? "Procesando…" : "Confirmar venta"}
                  </button>
                </div>

                <p className="text-xs text-gray-400 text-center">
                  La operación quedará registrada en el historial de tu cartera.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ── Small layout helpers ── */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      {value}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
