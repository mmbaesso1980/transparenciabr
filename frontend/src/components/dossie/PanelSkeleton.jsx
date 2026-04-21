export default function PanelSkeleton() {
  return (
    <div className="min-h-full animate-pulse bg-[#080B14] pb-10">
      <div className="border-b border-[#30363D] px-6 py-5">
        <div className="h-3 w-40 rounded bg-[#21262D]" />
        <div className="mt-4 h-8 w-72 max-w-full rounded bg-[#21262D]" />
      </div>
      <div className="grid grid-cols-12 gap-4 p-6">
        {[1, 2, 3, 4, 5].map((k) => (
          <div
            key={k}
            className={`glass dashboard-panel col-span-12 rounded-xl bg-[#0D1117]/80 ${
              k <= 3
                ? "h-96 lg:col-span-4"
                : k === 4
                  ? "h-80 lg:col-span-7"
                  : "h-80 lg:col-span-5"
            }`}
          >
            <div className="h-full rounded-lg bg-[#21262D]/40" />
          </div>
        ))}
      </div>
    </div>
  );
}
