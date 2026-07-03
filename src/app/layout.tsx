import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";

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
  return (
    <html lang="pt-BR" className={`${archivo.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-stone-50 text-stone-900">
        <SiteNav />
        <main className="w-full flex-1">{children}</main>
      </body>
    </html>
  );
}
