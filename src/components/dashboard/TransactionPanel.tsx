"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { PositionMetrics, TransactionRecord } from "@/services/transactionService";

interface Props {
  stockId:      string;
  ticker:       string;
  currentPrice: number | null;
}

// ── Formatting helpers ────────────────────────────────────────────────────────
const fmtUSD = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const fmtPct = (n: number, sign = true) =>
  `${sign && n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const pnlClass = (n: number | null) =>
  n == null ? "text-gray-500" : n >= 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold";

// Converts a Date | string | null to "YYYY-MM-DD" for date inputs
function toDateInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split("T")[0];
}

// ── MetricBox ─────────────────────────────────────────────────────────────────
function MetricBox({
  label, value, sub, valueClass = "text-gray-900",
}: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 text-center">
      <p className="text-xs text-gray-400 truncate">{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TransactionPanel({ stockId, ticker, currentPrice }: Props) {
  const router = useRouter();

  const [open,    setOpen]    = useState(false);
  const [metrics, setMetrics] = useState<PositionMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  // Form state — shared for create and edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen,  setFormOpen]  = useState(false);
  const [fType,     setFType]     = useState<"BUY" | "SELL">("BUY");
  const [fShares,   setFShares]   = useState("");
  const [fPrice,    setFPrice]    = useState(currentPrice?.toFixed(2) ?? "");
  const [fDate,     setFDate]     = useState("");
  const [fNotes,    setFNotes]    = useState("");
  const [fErr,      setFErr]      = useState<string | null>(null);
  const [fSaving,   setFSaving]   = useState(false);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const qs  = `stockId=${stockId}${currentPrice ? `&currentPrice=${currentPrice}` : ""}`;
      const res = await fetch(`/api/portfolio/transactions?${qs}`);
      if (res.ok) setMetrics(await res.json() as PositionMetrics);
    } finally {
      setLoading(false);
    }
  }, [stockId, currentPrice]);

  function handleToggle() {
    if (!open && !metrics) loadMetrics();
    setOpen((v) => !v);
  }

  function openNewForm() {
    setEditingId(null);
    setFType("BUY");
    setFShares("");
    setFPrice(currentPrice?.toFixed(2) ?? "");
    setFDate("");
    setFNotes("");
    setFErr(null);
    setFormOpen(true);
  }

  function openEditForm(tx: TransactionRecord) {
    setEditingId(tx.id);
    setFType(tx.type);
    setFShares(String(tx.shares));
    setFPrice(String(tx.price));
    setFDate(toDateInput(tx.date));
    setFNotes(tx.notes ?? "");
    setFErr(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setFErr(null);
  }

  async function handleSubmit() {
    const shares = parseFloat(fShares);
    const price  = parseFloat(fPrice);
    if (!isFinite(shares) || shares <= 0) { setFErr("Acciones debe ser un número positivo."); return; }
    if (!isFinite(price)  || price  <= 0) { setFErr("Precio debe ser un número positivo.");   return; }

    setFSaving(true); setFErr(null);
    try {
      const body = JSON.stringify({
        ...(editingId ? {} : { stockId }),
        type: fType, shares, price,
        date:  fDate  || null,
        notes: fNotes || null,
      });

      const res = editingId
        ? await fetch(`/api/portfolio/transactions/${editingId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body,
          })
        : await fetch("/api/portfolio/transactions", {
            method: "POST",  headers: { "Content-Type": "application/json" }, body,
          });

      const data = await res.json() as { error?: string };
      if (!res.ok) { setFErr(data.error ?? "Error al guardar."); return; }

      closeForm();
      await loadMetrics();
      router.refresh();
    } catch {
      setFErr("Error de conexión.");
    } finally {
      setFSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta transacción? Los cálculos se recalcularán automáticamente.")) return;
    const res = await fetch(`/api/portfolio/transactions/${id}`, { method: "DELETE" });
    if (res.ok) { await loadMetrics(); router.refresh(); }
  }

  return (
    <div className="border-t border-gray-100 pt-3 space-y-3">

      {/* ── Toggle header ── */}
      <button onClick={handleToggle} className="flex items-center justify-between w-full text-left">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Transacciones {ticker}
        </span>
        <span className="text-xs text-blue-500">{open ? "Ocultar ▲" : "Ver detalle ▼"}</span>
      </button>

      {/* ── Compact summary (always visible once metrics loaded) ── */}
      {metrics && metrics.openShares > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <MetricBox label="Acciones"           value={String(metrics.openShares)} />
          <MetricBox label="Precio medio compra" value={metrics.avgBuyPrice != null ? fmtUSD(metrics.avgBuyPrice) : "—"} />
          <MetricBox
            label="PnL no realizado"
            value={metrics.unrealizedPnL != null ? fmtUSD(metrics.unrealizedPnL) : "—"}
            sub={metrics.unrealizedPnLPct != null ? fmtPct(metrics.unrealizedPnLPct) : undefined}
            valueClass={pnlClass(metrics.unrealizedPnL)}
          />
        </div>
      )}

      {/* ── Expanded panel ── */}
      {open && (
        <div className="space-y-4">
          {loading && <p className="text-xs text-gray-400">Cargando…</p>}

          {metrics && (
            <>
              {/* Full metrics */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <MetricBox label="Precio equilibrio" value={metrics.breakEvenPrice != null ? fmtUSD(metrics.breakEvenPrice) : "—"} />
                <MetricBox label="Coste base"        value={fmtUSD(metrics.openCostBasis)} />
                <MetricBox label="Valor actual"      value={metrics.currentValue != null ? fmtUSD(metrics.currentValue) : "—"} />
                <MetricBox
                  label="PnL realizado"
                  value={fmtUSD(metrics.realizedPnL)}
                  sub={metrics.realizedPnLPct != null ? fmtPct(metrics.realizedPnLPct) : undefined}
                  valueClass={pnlClass(metrics.realizedPnL)}
                />
                <MetricBox label="Días en cartera"  value={metrics.daysHeld != null ? `${metrics.daysHeld}d` : "—"} />
                <MetricBox
                  label="CAGR anualizado"
                  value={metrics.annualizedReturn != null ? fmtPct(metrics.annualizedReturn) : "—"}
                  valueClass={pnlClass(metrics.annualizedReturn)}
                />
                {metrics.avgSellPrice != null && (
                  <MetricBox label="Precio medio venta" value={fmtUSD(metrics.avgSellPrice)} />
                )}
                {metrics.portfolioWeightPct != null && (
                  <MetricBox label="Peso en cartera" value={`${metrics.portfolioWeightPct.toFixed(1)}%`} />
                )}
              </div>

              {/* Transaction list */}
              {metrics.transactions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500">Historial de operaciones</p>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {[...metrics.transactions]
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((tx) => (
                        <TxRow
                          key={tx.id}
                          tx={tx}
                          onEdit={openEditForm}
                          onDelete={handleDelete}
                        />
                      ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Form or "add" button */}
          {!formOpen ? (
            <button
              onClick={openNewForm}
              className="w-full rounded-xl border border-dashed border-gray-300 py-2 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              + Registrar transacción
            </button>
          ) : (
            <TransactionForm
              isEditing={editingId !== null}
              type={fType} shares={fShares} price={fPrice} date={fDate} notes={fNotes}
              saving={fSaving} error={fErr}
              onTypeChange={setFType}
              onSharesChange={setFShares}
              onPriceChange={setFPrice}
              onDateChange={setFDate}
              onNotesChange={setFNotes}
              onSubmit={handleSubmit}
              onCancel={closeForm}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Transaction row ───────────────────────────────────────────────────────────
function TxRow({
  tx, onEdit, onDelete,
}: {
  tx:       TransactionRecord;
  onEdit:   (tx: TransactionRecord) => void;
  onDelete: (id: string) => void;
}) {
  const isBuy   = tx.type === "BUY";
  const dateStr = tx.date
    ? new Date(tx.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
    : new Date(tx.createdAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-xs">
      <span className={`font-bold w-8 shrink-0 ${isBuy ? "text-green-600" : "text-red-600"}`}>
        {isBuy ? "BUY" : "SELL"}
      </span>
      <span className="text-gray-700 flex-1 min-w-0">
        {tx.shares} × {fmtUSD(tx.price)}
      </span>
      <span className="text-gray-400 shrink-0">{dateStr}</span>
      {tx.notes && (
        <span className="text-gray-400 truncate max-w-[72px] shrink-0" title={tx.notes}>📝</span>
      )}
      {/* Edit button */}
      <button
        onClick={() => onEdit(tx)}
        className="text-gray-300 hover:text-blue-500 transition-colors shrink-0"
        aria-label="Editar"
        title="Editar transacción"
      >
        ✏️
      </button>
      {/* Delete button */}
      <button
        onClick={() => onDelete(tx.id)}
        className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
        aria-label="Eliminar"
        title="Eliminar transacción"
      >
        ✕
      </button>
    </div>
  );
}

// ── Transaction form ──────────────────────────────────────────────────────────
// Fixed input class — bg-white + text-gray-900 ensures legible text on all themes
const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-900";

interface FormProps {
  isEditing:      boolean;
  type:           "BUY" | "SELL";
  shares:         string;
  price:          string;
  date:           string;
  notes:          string;
  saving:         boolean;
  error:          string | null;
  onTypeChange:   (v: "BUY" | "SELL") => void;
  onSharesChange: (v: string) => void;
  onPriceChange:  (v: string) => void;
  onDateChange:   (v: string) => void;
  onNotesChange:  (v: string) => void;
  onSubmit:       () => void;
  onCancel:       () => void;
}

function TransactionForm({
  isEditing, type, shares, price, date, notes, saving, error,
  onTypeChange, onSharesChange, onPriceChange, onDateChange, onNotesChange,
  onSubmit, onCancel,
}: FormProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-700">
        {isEditing ? "Editar transacción" : "Nueva transacción"}
      </p>

      {/* BUY / SELL toggle */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
        {(["BUY", "SELL"] as const).map((t) => (
          <button
            key={t}
            onClick={() => onTypeChange(t)}
            className={`flex-1 py-2 transition-colors ${
              type === t
                ? t === "BUY" ? "bg-green-500 text-white" : "bg-red-500 text-white"
                : "bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            {t === "BUY" ? "Compra" : "Venta"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FormField label="Acciones *">
          <input
            type="number" min="0.001" step="any" value={shares}
            onChange={(e) => onSharesChange(e.target.value)}
            className={inputCls} placeholder="ej: 10"
          />
        </FormField>
        <FormField label={`Precio ${type === "BUY" ? "compra" : "venta"} * (USD)`}>
          <input
            type="number" min="0.01" step="any" value={price}
            onChange={(e) => onPriceChange(e.target.value)}
            className={inputCls} placeholder="ej: 150.00"
          />
        </FormField>
        <FormField label="Fecha (opcional)">
          <input
            type="date" value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className={inputCls}
          />
        </FormField>
        <FormField label="Notas (opcional)">
          <input
            type="text" value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            className={inputCls} placeholder="¿Por qué compraste?"
          />
        </FormField>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCancel} disabled={saving}
          className="flex-1 rounded-xl border border-gray-300 text-xs font-medium py-2 text-gray-600 bg-white hover:bg-gray-100 disabled:opacity-40 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={onSubmit} disabled={saving}
          className={`flex-1 rounded-xl text-white text-xs font-medium py-2 disabled:opacity-40 transition-colors ${
            type === "BUY" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
          }`}
        >
          {saving
            ? "Guardando…"
            : isEditing
              ? `Actualizar ${type === "BUY" ? "compra" : "venta"}`
              : `Registrar ${type === "BUY" ? "compra" : "venta"}`}
        </button>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
