import { AnimatePresence, motion } from "framer-motion";

export default function OrbTooltip({ node, position }) {
  if (!node || !position) return null;

  const partido = node.partido || node.party || "—";
  const uf = node.uf || node.state || "";
  const partidoLabel = uf ? `${partido}-${uf}` : partido;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 4, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        style={{
          position: "fixed",
          left: position.x + 14,
          top: position.y + 14,
          pointerEvents: "none",
          zIndex: 50,
        }}
        className="rounded-lg border border-white/10 bg-zinc-900/90 px-3 py-2 shadow-2xl backdrop-blur-md"
      >
        <div className="text-sm font-semibold tracking-tight text-white">
          {node.label || node.nome || node.id}
        </div>
        <div className="mt-0.5 text-xs text-zinc-400">{partidoLabel}</div>
      </motion.div>
    </AnimatePresence>
  );
}
