import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { readWatchlist } from "@/lib/watchlist";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // CLIENTE é a unidade primária: a sidebar lista as contas (a watchlist).
  const clients = readWatchlist().clients.map((c) => c.name);

  return (
    <html lang="pt-BR" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full bg-stone-50 text-stone-900">
        <Suspense>
          <AppShell clients={clients}>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
