"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { PositionMetrics, TransactionRecord } from "@/services/transactionService";

type TxType = "BUY" | "SELL" | "SPLIT" | "DIVIDEND";

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
    <div className="bg-white border border-slate-100 rounded-xl p-2.5 text-center">
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
  const [fType,     setFType]     = useState<TxType>("BUY");
  const [fShares,   setFShares]   = useState("");
  const [fPrice,    setFPrice]    = useState(currentPrice?.toFixed(2) ?? "");
  const [fDate,     setFDate]     = useState("");
  const [fFee,      setFFee]      = useState("");
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
    setFFee("");
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
    setFFee(tx.fee ? String(tx.fee) : "");
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
    const isSplit = fType === "SPLIT";
    const shares  = parseFloat(fShares);
    const price   = isSplit ? 1 : parseFloat(fPrice);
    const fee     = fFee.trim() ? parseFloat(fFee) : 0;
    if (!isFinite(shares) || shares <= 0) {
      setFErr(isSplit ? "El factor debe ser un número positivo (ej: 10 para 10:1)." : "Acciones debe ser un número positivo.");
      return;
    }
    if (!isFinite(price) || price <= 0) {
      setFErr(fType === "DIVIDEND" ? "El dividendo por acción debe ser un número positivo." : "Precio debe ser un número positivo.");
      return;
    }
    if (!isFinite(fee) || fee < 0) { setFErr("La comisión/retención no puede ser negativa."); return; }

    setFSaving(true); setFErr(null);
    try {
      const body = JSON.stringify({
        ...(editingId ? {} : { stockId }),
        type: fType, shares, price,
        fee:   isSplit ? 0 : fee,
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
                {metrics.totalDividends > 0 && (
                  <MetricBox label="Dividendos netos" value={fmtUSD(metrics.totalDividends)} valueClass="text-green-600 font-semibold" />
                )}
                {metrics.totalFees > 0 && (
                  <MetricBox label="Comisiones" value={fmtUSD(metrics.totalFees)} valueClass="text-gray-500" />
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
              type={fType} shares={fShares} price={fPrice} date={fDate} fee={fFee} notes={fNotes}
              saving={fSaving} error={fErr}
              onTypeChange={setFType}
              onSharesChange={setFShares}
              onPriceChange={setFPrice}
              onDateChange={setFDate}
              onFeeChange={setFFee}
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
  const isBuy = tx.type === "BUY";
  const isSplit = tx.type === "SPLIT";
  const isDiv = tx.type === "DIVIDEND";
  const dateStr = tx.date
    ? new Date(tx.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
    : new Date(tx.createdAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="flex items-center gap-2 rounded-lg bg-white border border-slate-100 px-3 py-2 text-xs">
      <span className={`font-bold w-10 shrink-0 ${isSplit ? "text-blue-600" : isDiv ? "text-amber-600" : isBuy ? "text-green-600" : "text-red-600"}`}>
        {isDiv ? "DIV" : tx.type}
      </span>
      <span className="text-gray-700 flex-1 min-w-0">
        {isSplit
          ? `Split ×${tx.shares}`
          : isDiv
          ? <>{fmtUSD(tx.shares * tx.price - (tx.fee ?? 0))} neto</>
          : <>{tx.shares} × {fmtUSD(tx.price)}{tx.fee ? ` − ${fmtUSD(tx.fee)} com.` : ""}</>}
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
  type:           TxType;
  shares:         string;
  price:          string;
  date:           string;
  fee:            string;
  notes:          string;
  saving:         boolean;
  error:          string | null;
  onTypeChange:   (v: TxType) => void;
  onSharesChange: (v: string) => void;
  onPriceChange:  (v: string) => void;
  onDateChange:   (v: string) => void;
  onFeeChange:    (v: string) => void;
  onNotesChange:  (v: string) => void;
  onSubmit:       () => void;
  onCancel:       () => void;
}

const TYPE_LABELS: Record<TxType, string> = {
  BUY: "Compra", SELL: "Venta", SPLIT: "Split", DIVIDEND: "Dividendo",
};
const TYPE_ACTIVE_CLS: Record<TxType, string> = {
  BUY: "bg-green-500 text-white", SELL: "bg-red-500 text-white",
  SPLIT: "bg-blue-500 text-white", DIVIDEND: "bg-amber-500 text-white",
};
const TYPE_SUBMIT_CLS: Record<TxType, string> = {
  BUY: "bg-green-600 hover:bg-green-700", SELL: "bg-red-600 hover:bg-red-700",
  SPLIT: "bg-blue-600 hover:bg-blue-700", DIVIDEND: "bg-amber-600 hover:bg-amber-700",
};

function TransactionForm({
  isEditing, type, shares, price, date, fee, notes, saving, error,
  onTypeChange, onSharesChange, onPriceChange, onDateChange, onFeeChange, onNotesChange,
  onSubmit, onCancel,
}: FormProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-700">
        {isEditing ? "Editar transacción" : "Nueva transacción"}
      </p>

      {/* BUY / SELL / SPLIT / DIVIDEND toggle */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
        {(["BUY", "SELL", "SPLIT", "DIVIDEND"] as const).map((t) => (
          <button
            key={t}
            onClick={() => onTypeChange(t)}
            className={`flex-1 py-2 transition-colors ${
              type === t ? TYPE_ACTIVE_CLS[t] : "bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {type === "SPLIT" && (
        <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5">
          Ajusta la posición por un split: factor 10 = split 10:1 (×10 acciones, ÷10 precio medio);
          factor 0.1 = contrasplit 1:10. No afecta al capital invertido ni al P&L realizado.
        </p>
      )}
      {type === "DIVIDEND" && (
        <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
          Dividendo cobrado: acciones × importe por acción = bruto; la retención se descuenta
          como neto. Se acumula en «Dividendos netos» sin alterar la posición.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <FormField label={type === "SPLIT" ? "Factor del split *" : "Acciones *"}>
          <input
            type="number" min="0.001" step="any" value={shares}
            onChange={(e) => onSharesChange(e.target.value)}
            className={inputCls} placeholder={type === "SPLIT" ? "ej: 10 (10:1)" : "ej: 10"}
          />
        </FormField>
        {type !== "SPLIT" && (
          <FormField label={
            type === "DIVIDEND" ? "Dividendo por acción * (USD)"
            : `Precio ${type === "BUY" ? "compra" : "venta"} * (USD)`
          }>
            <input
              type="number" min="0.01" step="any" value={price}
              onChange={(e) => onPriceChange(e.target.value)}
              className={inputCls} placeholder={type === "DIVIDEND" ? "ej: 0.25" : "ej: 150.00"}
            />
          </FormField>
        )}
        <FormField label={type === "SPLIT" ? "Fecha efectiva (opcional)" : "Fecha (opcional)"}>
          <input
            type="date" value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className={inputCls}
          />
        </FormField>
        {type !== "SPLIT" && (
          <FormField label={type === "DIVIDEND" ? "Retención (opcional, USD)" : "Comisión (opcional, USD)"}>
            <input
              type="number" min="0" step="any" value={fee}
              onChange={(e) => onFeeChange(e.target.value)}
              className={inputCls} placeholder={type === "DIVIDEND" ? "ej: 1.20" : "ej: 0.50"}
            />
          </FormField>
        )}
        <FormField label="Notas (opcional)">
          <input
            type="text" value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            className={inputCls} placeholder={
              type === "SPLIT" ? "ej: split 10:1 NFLX"
              : type === "DIVIDEND" ? "ej: dividendo trimestral"
              : "¿Por qué compraste?"
            }
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
          className={`flex-1 rounded-xl text-white text-xs font-medium py-2 disabled:opacity-40 transition-colors ${TYPE_SUBMIT_CLS[type]}`}
        >
          {saving
            ? "Guardando…"
            : `${isEditing ? "Actualizar" : "Registrar"} ${TYPE_LABELS[type].toLowerCase()}`}
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
