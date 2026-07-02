/**
 * /entrar — a porta de entrada do Radar (senha única do Rafael).
 *
 * Form HTML puro (sem JS): POST /api/entrar valida e grava o cookie.
 * `?erro=1` mostra o aviso de senha errada.
 */

export const dynamic = "force-dynamic";

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;

  return (
    <section className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 ring-4 ring-red-500/15"
          />
          <span className="text-[15px] font-semibold tracking-tight text-stone-900">Radar</span>
        </div>

        <h1 className="mt-5 text-xl font-semibold tracking-tight text-stone-900">Entrar</h1>
        <p className="mt-1 text-sm text-stone-500">
          Área restrita da Formare. Digite a senha do Radar.
        </p>

        {erro ? (
          <p className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            Senha incorreta. Tente de novo.
          </p>
        ) : null}

        <form method="POST" action="/api/entrar" className="mt-5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Senha</span>
            <input
              type="password"
              name="senha"
              required
              autoFocus
              className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700"
          >
            Entrar no Radar
          </button>
        </form>
      </div>
    </section>
  );
}
