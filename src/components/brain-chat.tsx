"use client";

/**
 * BRAIN CHAT — o "Pergunte ao Brain" SEMPRE VISÍVEL: uma bolha flutuante no canto
 * inferior direito, presente em toda tela com chrome. Abre um painel de conversa
 * (a mesma `AskThread`) por cima do conteúdo, com SELETOR DE CLIENTE — a conversa
 * fica ancorada no cliente escolhido (o material/Brain são só dele).
 *
 * Montado no app-shell → NÃO desmonta ao navegar: a conversa e a escolha do
 * cliente sobrevivem à navegação (o painel só é escondido, não destruído).
 */

import { useEffect, useState } from "react";

import { AskThread } from "@/components/ask-thread";

const OPEN_KEY = "radar:brainchat-open";

export function BrainChat({ clients, cliente }: { clients: string[]; cliente: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(cliente || clients[0] || "");

  // restaura o estado aberto/fechado (uma vez, no cliente).
  useEffect(() => {
    try {
      if (localStorage.getItem(OPEN_KEY) === "1") setOpen(true);
    } catch {
      /* ignora */
    }
  }, []);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(OPEN_KEY, next ? "1" : "0");
      } catch {
        /* ignora */
      }
      return next;
    });
  }

  if (clients.length === 0) return null;

  return (
    <>
      {/* PAINEL — mantido montado (só escondido) pra a conversa sobreviver. */}
      <div
        className={
          "fixed inset-x-3 bottom-24 top-16 z-40 flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl " +
          "sm:inset-x-auto sm:top-auto sm:bottom-24 sm:right-5 sm:h-[600px] sm:max-h-[78vh] sm:w-[400px] " +
          (open ? "flex" : "hidden")
        }
        role="dialog"
        aria-label="Pergunte ao Brain"
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-stone-200 px-4 py-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-50 text-red-600">
            <ChatIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold leading-none text-stone-900">Pergunte ao Brain</p>
            <p className="mt-0.5 text-[11px] text-stone-400">Respostas com fonte, honesto quando não sabe.</p>
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label="Fechar"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>

        <AskThread
          clients={clients}
          clientName={selected || undefined}
          onClientChange={setSelected}
          showSelector
          scrollClass="flex-1 min-h-0"
          placeholder="Pergunte sobre este cliente…"
        />
      </div>

      {/* LAUNCHER — sempre visível; alterna abrir/fechar. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={open ? "Fechar o Pergunte ao Brain" : "Abrir o Pergunte ao Brain"}
        title="Pergunte ao Brain"
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-stone-900 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        {open ? <CloseIcon className="h-6 w-6" /> : <ChatIcon className="h-6 w-6" />}
      </button>
    </>
  );
}

function ChatIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CloseIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
