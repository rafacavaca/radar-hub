/**
 * Render de markdown LEVE do corpo do relatório (server-safe, sem lib): "## " →
 * h3, "- " → lista, **negrito** inline; [n] fica literal. Usado no link público
 * e reusável na tela. Espelha o renderLightMarkdown do reports-view.
 */

import type { ReactNode } from "react";

function renderInline(text: string): ReactNode {
  return text.split("**").map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-stone-900">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

export function ReportMarkdown({ corpo }: { corpo: string }) {
  const lines = corpo.split("\n");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flush = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${key++}`} className="ml-0.5 space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="mt-[9px] h-1 w-1 flex-none rounded-full bg-stone-400" />
            <span>{renderInline(item)}</span>
          </li>
        ))}
      </ul>,
    );
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (/^#\s+/.test(line)) continue; // título já é o h1 da página
    if (/^#{2,6}\s+/.test(line)) {
      flush();
      blocks.push(
        <h3 key={`h-${key++}`} className="mt-5 text-base font-semibold text-stone-900 first:mt-0">
          {renderInline(line.replace(/^#{2,6}\s+/, ""))}
        </h3>,
      );
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      bullets.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    flush();
    if (line === "") continue;
    blocks.push(<p key={`p-${key++}`}>{renderInline(line)}</p>);
  }
  flush();

  return <div className="space-y-2">{blocks.length ? blocks : <p>{corpo}</p>}</div>;
}
