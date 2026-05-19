"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface Question {
  id: string;
  text: string;
  options: { label: string; score: number }[];
}

const QUESTIONS: Question[] = [
  {
    id: "horizon",
    text: "¿Cuándo necesitarás este dinero?",
    options: [
      { label: "En menos de 2 años", score: 1 },
      { label: "En 2–5 años", score: 3 },
      { label: "En 5–10 años", score: 6 },
      { label: "En más de 10 años", score: 8 },
    ],
  },
  {
    id: "loss_tolerance",
    text: "Si tu cartera cayera un 20%, ¿qué harías?",
    options: [
      { label: "Vendería todo inmediatamente", score: 1 },
      { label: "Me preocuparía pero mantendría", score: 3 },
      { label: "Mantendría sin preocupación", score: 5 },
      { label: "Compraría más aprovechando la bajada", score: 7 },
    ],
  },
  {
    id: "objective",
    text: "¿Cuál es el objetivo de esta inversión?",
    options: [
      { label: "Preservar el capital con seguridad", score: 1 },
      { label: "Crecimiento moderado y estable", score: 3 },
      { label: "Crecimiento agresivo a largo plazo", score: 5 },
      { label: "Maximizar rentabilidad, acepto alta volatilidad", score: 7 },
    ],
  },
  {
    id: "experience",
    text: "¿Cuál es tu experiencia invirtiendo?",
    options: [
      { label: "Principiante — primeros pasos", score: 1 },
      { label: "Básico — fondos o ETFs sencillos", score: 3 },
      { label: "Intermedio — acciones individuales", score: 5 },
      { label: "Avanzado — opciones, derivados, etc.", score: 7 },
    ],
  },
  {
    id: "pct_wealth",
    text: "¿Qué porcentaje de tu patrimonio total inviertes?",
    options: [
      { label: "Menos del 10%", score: 1 },
      { label: "Entre el 10% y el 30%", score: 3 },
      { label: "Más del 30%", score: 5 },
      { label: "Más del 50%", score: 6 },
    ],
  },
];

const RISK_CONFIG: Record<string, { color: string; bg: string; desc: string }> = {
  Conservador: {
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
    desc: "Priorizas la seguridad del capital. Prefieres rentabilidades menores a cambio de baja volatilidad.",
  },
  Moderado: {
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    desc: "Buscas equilibrio entre rentabilidad y riesgo. Aceptas cierta volatilidad para mejores retornos.",
  },
  Agresivo: {
    color: "text-red-700",
    bg: "bg-red-50 border-red-200",
    desc: "Maximizas la rentabilidad a largo plazo. Toleras alta volatilidad y caídas temporales significativas.",
  },
};

export default function RiskProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/dashboard";

  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ riskScore: number; riskLabel: string } | null>(null);

  const totalQuestions = QUESTIONS.length;
  const answered = Object.keys(answers).length;
  const allAnswered = answered === totalQuestions;

  const riskScore = Object.values(answers).reduce((sum, v) => sum + v, 0);
  const previewLabel =
    riskScore <= 12 ? "Conservador" :
    riskScore <= 24 ? "Moderado"    : "Agresivo";

  async function submit() {
    if (!allAnswered) return;
    setSaving(true);
    const res = await fetch("/api/user/risk-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    if (res.ok) {
      const data = await res.json();
      setResult(data);
    }
    setSaving(false);
  }

  if (result) {
    const cfg = RISK_CONFIG[result.riskLabel];
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <h1 className="text-xl font-bold text-gray-900">Perfil de riesgo guardado</h1>
        <div className={`rounded-xl border p-6 space-y-3 ${cfg.bg}`}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tu perfil</p>
          <p className={`text-3xl font-bold ${cfg.color}`}>{result.riskLabel}</p>
          <p className="text-sm text-gray-700">{cfg.desc}</p>
          <p className="text-xs text-gray-500">Puntuación: {result.riskScore} / 35</p>
        </div>
        <p className="text-sm text-gray-600">
          El análisis de IA y las métricas de riesgo de tu dashboard ahora se calibrarán con este perfil.
          Puedes actualizarlo en cualquier momento desde Ajustes.
        </p>
        <Link
          href={returnTo}
          className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Ir al dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={returnTo} className="text-sm text-gray-500 hover:text-gray-700">← Volver</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">Perfil de riesgo</h1>
      </div>

      <p className="text-sm text-gray-600">
        Responde estas {totalQuestions} preguntas para que el análisis de IA se adapte a tu situación.
        No hay respuestas correctas o incorrectas.
      </p>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${(answered / totalQuestions) * 100}%` }}
        />
      </div>

      <div className="space-y-5">
        {QUESTIONS.map((q, qi) => (
          <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-gray-900">
              <span className="text-blue-500 mr-1">{qi + 1}.</span> {q.text}
            </p>
            <div className="space-y-2">
              {q.options.map((opt) => {
                const selected = answers[q.id] === opt.score;
                return (
                  <button
                    key={opt.score}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.score }))}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                      selected
                        ? "bg-blue-50 border-blue-400 text-blue-800 font-medium"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {allAnswered && (
        <div className={`rounded-xl border p-4 ${RISK_CONFIG[previewLabel].bg}`}>
          <p className="text-xs text-gray-500 mb-1">Vista previa de tu perfil</p>
          <p className={`text-lg font-bold ${RISK_CONFIG[previewLabel].color}`}>{previewLabel}</p>
          <p className="text-xs text-gray-600 mt-1">{RISK_CONFIG[previewLabel].desc}</p>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!allAnswered || saving}
        className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saving ? "Guardando..." : "Guardar perfil de riesgo"}
      </button>
    </div>
  );
}
