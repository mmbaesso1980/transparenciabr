import DespesasCeapAudit from "./DespesasCeapAudit.jsx";

/**
 * Bloco dossiê — gastos CEAP com notas fiscais na fonte primária.
 */
export default function GastosCeapSection({ record, godMode, oracleUnlocked, onRequestUnlock }) {
  return (
    <section className="glass-card overflow-hidden p-4 sm:p-5">
      <DespesasCeapAudit
        record={record}
        godMode={godMode}
        oracleUnlocked={oracleUnlocked}
        onRequestUnlock={onRequestUnlock}
      />
    </section>
  );
}
