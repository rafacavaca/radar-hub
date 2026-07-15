import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { VocabProvider } from "@/components/vocab-context";
import { isSuperAdmin } from "@/lib/db/session";
import { supabaseEnabled } from "@/lib/db/supabase";
import { loadVocab } from "@/lib/vocab";
import { loadWatchlist } from "@/lib/watchlist";

// UMA família em toda a interface — hierarquia por tamanho, peso e cor.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Radar — Inteligência de mercado",
  description:
    "Movimentos de concorrentes cruzados com o que se sabe do cliente, prontos pra decisão.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // CLIENTE é a unidade primária: a sidebar lista as contas (a watchlist da org
  // da sessão em modo Supabase; RLS escopa — cada agência vê só as suas).
  const clientList = (await loadWatchlist()).clients;
  const clients = clientList.map((c) => c.name);
  const modes = Object.fromEntries(clientList.map((c) => [c.name, c.mode ?? "concorrentes"]));
  // Administração na sidebar: super_admin no modo Supabase; dono no clássico.
  const isAdmin = supabaseEnabled() ? await isSuperAdmin() : true;
  // Vocabulário da agência (P13): rótulos renomeáveis, resolvidos no cliente.
  const vocab = await loadVocab();

  return (
    <html lang="pt-BR" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full bg-stone-50 text-stone-900">
        <Suspense>
          <VocabProvider vocab={vocab}>
            <AppShell clients={clients} modes={modes} isAdmin={isAdmin}>
              {children}
            </AppShell>
          </VocabProvider>
        </Suspense>
      </body>
    </html>
  );
}
