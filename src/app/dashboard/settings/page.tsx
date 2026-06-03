"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
      <h2 className="font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();

  // Profile
  const [name, setName]               = useState("");
  const [profileMsg, setProfileMsg]   = useState<{ ok: boolean; text: string } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Password
  const [currentPwd, setCurrentPwd]   = useState("");
  const [newPwd, setNewPwd]           = useState("");
  const [confirmPwd, setConfirmPwd]   = useState("");
  const [pwdMsg, setPwdMsg]           = useState<{ ok: boolean; text: string } | null>(null);
  const [pwdLoading, setPwdLoading]   = useState(false);

  // Reset portfolio
  const [resetConfirm, setResetConfirm]   = useState("");
  const [resetLoading, setResetLoading]   = useState(false);
  const [resetMsg, setResetMsg]           = useState<{ ok: boolean; text: string } | null>(null);

  // Delete account
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteMsg, setDeleteMsg]         = useState<string | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileLoading(true); setProfileMsg(null);
    const res = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setProfileLoading(false);
    setProfileMsg(res.ok
      ? { ok: true,  text: "Nombre actualizado correctamente." }
      : { ok: false, text: "Error al actualizar el nombre." });
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd !== confirmPwd) { setPwdMsg({ ok: false, text: "Las contraseñas no coinciden." }); return; }
    setPwdLoading(true); setPwdMsg(null);
    const res = await fetch("/api/user/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
    });
    const data = await res.json();
    setPwdLoading(false);
    if (res.ok) {
      setPwdMsg({ ok: true, text: "Contraseña actualizada correctamente." });
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    } else {
      setPwdMsg({ ok: false, text: data.error ?? "Error al cambiar la contraseña." });
    }
  }

  async function resetPortfolio() {
    if (resetConfirm !== "LIMPIAR") {
      setResetMsg({ ok: false, text: "Escribe LIMPIAR para confirmar." });
      return;
    }
    setResetLoading(true); setResetMsg(null);
    const res = await fetch("/api/portfolio/reset", { method: "DELETE" });
    setResetLoading(false);
    if (res.ok) {
      setResetMsg({ ok: true, text: "Cartera eliminada correctamente. Redirigiendo…" });
      setResetConfirm("");
      setTimeout(() => router.push("/dashboard"), 1500);
    } else {
      setResetMsg({ ok: false, text: "Error al limpiar la cartera. Inténtalo de nuevo." });
    }
  }

  async function deleteAccount() {
    if (deleteConfirm !== "ELIMINAR") { setDeleteMsg("Escribe ELIMINAR para confirmar."); return; }
    setDeleteLoading(true); setDeleteMsg(null);
    const res = await fetch("/api/user", { method: "DELETE" });
    if (res.ok) {
      await signOut({ callbackUrl: "/login" });
    } else {
      setDeleteLoading(false);
      setDeleteMsg("Error al eliminar la cuenta. Inténtalo de nuevo.");
    }
  }

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";
  const btnPrimary = "px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors";
  const btnDanger  = "px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors";

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">Ajustes de cuenta</h1>
      </div>

      <Section title="Perfil">
        <form onSubmit={saveProfile} className="space-y-4">
          <Field label="Nombre de usuario">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre (opcional)"
              className={inputClass}
            />
          </Field>
          {profileMsg && (
            <p className={`text-sm ${profileMsg.ok ? "text-green-600" : "text-red-600"}`}>{profileMsg.text}</p>
          )}
          <button type="submit" disabled={profileLoading} className={btnPrimary}>
            {profileLoading ? "Guardando..." : "Guardar nombre"}
          </button>
        </form>
      </Section>

      <Section title="Cambiar contraseña">
        <form onSubmit={changePassword} className="space-y-4">
          <Field label="Contraseña actual">
            <input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} required className={inputClass} />
          </Field>
          <Field label="Nueva contraseña">
            <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required minLength={8} placeholder="Mínimo 8 caracteres" className={inputClass} />
          </Field>
          <Field label="Confirmar nueva contraseña">
            <input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} required className={inputClass} />
          </Field>
          {pwdMsg && (
            <p className={`text-sm ${pwdMsg.ok ? "text-green-600" : "text-red-600"}`}>{pwdMsg.text}</p>
          )}
          <button type="submit" disabled={pwdLoading} className={btnPrimary}>
            {pwdLoading ? "Cambiando..." : "Cambiar contraseña"}
          </button>
        </form>
      </Section>

      <Section title="Perfil de riesgo">
        <p className="text-sm text-gray-600">
          Actualiza tu cuestionario de perfil de inversor para que el análisis de IA se adapte a tu tolerancia al riesgo.
        </p>
        <Link
          href="/dashboard/risk-profile?returnTo=/dashboard/settings"
          className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Actualizar perfil de riesgo
        </Link>
      </Section>

      <Section title="Limpiar cartera">
        <p className="text-sm text-gray-600">
          Elimina <strong>todas tus acciones, transacciones, historial de ventas y análisis IA</strong> sin borrar tu cuenta.
          Útil para reimportar un CSV corregido desde cero.
        </p>
        <div className="space-y-3">
          <Field label='Escribe "LIMPIAR" para confirmar'>
            <input
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              placeholder="LIMPIAR"
              className={`${inputClass} border-orange-300 focus:ring-orange-400`}
            />
          </Field>
          {resetMsg && (
            <p className={`text-sm ${resetMsg.ok ? "text-green-600" : "text-red-600"}`}>
              {resetMsg.text}
            </p>
          )}
          <button
            type="button"
            onClick={resetPortfolio}
            disabled={resetLoading || resetConfirm !== "LIMPIAR"}
            className="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            style={{ background: resetLoading || resetConfirm !== "LIMPIAR" ? "#9CA3AF" : "#EA580C" }}
          >
            {resetLoading ? "Limpiando…" : "Limpiar toda la cartera"}
          </button>
          <p className="text-xs text-gray-500" style={{ marginTop: 8 }}>
            💡 Si reimportaste un CSV y ves datos incorrectos (posiciones cerradas que siguen
            apareciendo, precios $0.00, tax harvesting con acciones que ya no tienes), usa esta
            opción para limpiar completamente y volver a importar desde cero.
          </p>
        </div>
      </Section>

      <Section title="Eliminar cuenta">
        <p className="text-sm text-gray-600">
          Esta acción es <strong>irreversible</strong>. Se eliminarán tu cuenta, todas tus acciones y el historial de análisis.
        </p>
        <div className="space-y-3">
          <Field label='Escribe "ELIMINAR" para confirmar'>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="ELIMINAR"
              className={`${inputClass} border-red-200 focus:ring-red-400`}
            />
          </Field>
          {deleteMsg && <p className="text-sm text-red-600">{deleteMsg}</p>}
          <button
            type="button"
            onClick={deleteAccount}
            disabled={deleteLoading || deleteConfirm !== "ELIMINAR"}
            className={btnDanger}
          >
            {deleteLoading ? "Eliminando..." : "Eliminar cuenta permanentemente"}
          </button>
        </div>
      </Section>
    </div>
  );
}
