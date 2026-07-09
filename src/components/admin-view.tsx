"use client";

/**
 * ADMIN (super_admin) — criar orgs e adicionar membros. Painel simples: form de
 * nova org, e por org um form de "adicionar membro por e-mail". A senha
 * temporária (quando o usuário é criado) aparece UMA vez pro Rafael repassar.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

type Member = { user_id: string; email: string; role: string };
type Org = { id: string; slug: string; name: string; members: Member[] };

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const res = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, data: json.data } : { ok: false, error: json.error ?? `erro ${res.status}` };
}

function NovaOrg() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  async function submit() {
    if (!name.trim()) return;
    setBusy(true); setErro("");
    const r = await post({ action: "create-org", name: name.trim() });
    setBusy(false);
    if (!r.ok) { setErro(r.error ?? "falha"); return; }
    setName(""); router.refresh();
  }
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-stone-900">Nova agência (org)</h2>
      <div className="mt-3 flex gap-2">
        <input
          value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da agência"
          className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
        />
        <button onClick={submit} disabled={busy} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Criando…" : "Criar"}
        </button>
      </div>
      {erro ? <p className="mt-2 text-xs text-red-600">{erro}</p> : null}
    </div>
  );
}

function AddMembro({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "org_admin">("member");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  async function submit() {
    if (!email.trim()) return;
    setBusy(true); setMsg(null);
    const r = await post({ action: "add-member", orgId, email: email.trim(), role });
    setBusy(false);
    if (!r.ok) { setMsg({ tipo: "erro", texto: r.error ?? "falha" }); return; }
    const d = r.data as { tempPassword?: string };
    setMsg({ tipo: "ok", texto: d.tempPassword ? `Adicionado. Senha temporária (mostre 1x): ${d.tempPassword}` : "Adicionado (usuário já existia)." });
    setEmail(""); router.refresh();
  }
  return (
    <div className="mt-3 border-t border-stone-100 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@agencia.com" type="email"
          className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-sm outline-none focus:border-stone-500"
        />
        <select value={role} onChange={(e) => setRole(e.target.value as "member" | "org_admin")} className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm">
          <option value="member">membro</option>
          <option value="org_admin">admin da org</option>
        </select>
        <button onClick={submit} disabled={busy} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50">
          {busy ? "…" : "Adicionar"}
        </button>
      </div>
      {msg ? <p className={`mt-2 text-xs ${msg.tipo === "ok" ? "text-emerald-700" : "text-red-600"}`}>{msg.texto}</p> : null}
    </div>
  );
}

export function AdminView({ orgs }: { orgs: Org[] }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-8">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">Admin · agências</h1>
      </div>
      <p className="mt-1 text-sm text-stone-500">
        Criar organizações (agências) e adicionar usuários. Cada agência só vê os próprios dados (isolamento no banco/RLS).
      </p>

      <div className="mt-6"><NovaOrg /></div>

      <div className="mt-6 space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Organizações ({orgs.length})</h2>
        {orgs.map((org) => (
          <div key={org.id} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-stone-900">{org.name}</span>
              <span className="text-[11px] text-stone-400">{org.slug}</span>
            </div>
            <ul className="mt-2 space-y-1">
              {org.members.length === 0 ? (
                <li className="text-xs text-stone-400">Sem membros ainda.</li>
              ) : org.members.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between text-sm text-stone-700">
                  <span className="truncate">{m.email}</span>
                  <span className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[11px] ${m.role === "super_admin" ? "bg-red-50 text-red-700" : m.role === "org_admin" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"}`}>{m.role}</span>
                </li>
              ))}
            </ul>
            <AddMembro orgId={org.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
