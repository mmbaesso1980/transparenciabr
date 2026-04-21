/**
 * Identidade parlamentar — foto e referência do documento (gauge na linha Bentobox dedicada).
 */
export default function IdentitySection({
  nomeExibicao = "—",
  photoAbs,
  politicoId = "",
}) {
  return (
    <section className="glass-card relative flex min-h-[10rem] flex-col overflow-hidden p-0">
      <div className="border-b border-[#30363D] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#8B949E]">
          Identidade parlamentar
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          {photoAbs ? (
            <img
              src={photoAbs}
              alt=""
              className="size-[4.5rem] shrink-0 rounded-2xl border border-[#30363D] object-cover"
            />
          ) : (
            <div
              className="flex size-[4.5rem] shrink-0 items-center justify-center rounded-2xl border border-dashed border-[#30363D] bg-[#161B22] text-[11px] text-[#484F58]"
              aria-hidden
            >
              foto
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight text-[#F0F4FC] md:text-xl">
              {nomeExibicao}
            </h2>
            <p className="mt-1 font-data text-[11px]">
              {politicoId ? `politicos/${politicoId}` : "—"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
