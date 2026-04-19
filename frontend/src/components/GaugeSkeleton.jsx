/** Skeleton alta densidade para o medidor radial — aguardando índice do Firestore */
export default function GaugeSkeleton() {
  return (
    <div className="flex h-full min-h-[200px] w-full flex-col items-center justify-center gap-4 px-4">
      <div className="relative h-[118px] w-[min(100%,280px)] animate-pulse rounded-full bg-[#21262D]/90" />
      <div className="flex flex-col items-center gap-2">
        <div className="h-10 w-24 animate-pulse rounded-md bg-[#21262D]" />
        <div className="h-3 w-40 animate-pulse rounded bg-[#30363D]" />
      </div>
      <p className="text-center text-[11px] text-[#8B949E]">
        A aguardar índice agregado no documento…
      </p>
    </div>
  );
}
