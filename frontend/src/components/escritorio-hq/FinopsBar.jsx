/**
 * FinopsBar.jsx — Barra de queima Vertex janela 1h
 *
 * 3 zonas:
 *  - Verde:    0% a 70% do soft cap
 *  - Amarelo:  70% a 90% (alerta)
 *  - Vermelho: 90% a 100%+ (acima do hard cap → bloqueio F5)
 */

export default function FinopsBar({ burn_brl = 0, soft_cap = 30, hard_cap = 80 }) {
  const pct = Math.min(100, (burn_brl / hard_cap) * 100);
  const softPct = (soft_cap / hard_cap) * 100;

  let color = '#00AA44'; // verde
  if (burn_brl >= soft_cap * 0.9) color = '#CC0000'; // vermelho
  else if (burn_brl >= soft_cap * 0.7) color = '#C9A227'; // amarelo

  return (
    <div style={{
      background: '#1a2a2a',
      border: '1px solid #01696F',
      borderRadius: 6,
      padding: '8px 12px',
      fontFamily: 'Inter, sans-serif',
      color: '#E5E7EB',
      fontSize: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span>💰 Vertex (janela 1h)</span>
        <span style={{ color, fontWeight: 600 }}>
          R$ {burn_brl.toFixed(2)} / R$ {hard_cap.toFixed(0)}
        </span>
      </div>
      <div style={{
        position: 'relative',
        height: 8,
        background: '#0D1E1E',
        borderRadius: 4,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          transition: 'width 0.3s ease',
        }} />
        {/* Marca do soft cap */}
        <div style={{
          position: 'absolute',
          left: `${softPct}%`,
          top: 0,
          width: 2,
          height: '100%',
          background: '#fff',
          opacity: 0.5,
        }} title={`Soft cap R$ ${soft_cap}`} />
      </div>
      <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>
        Soft cap R$ {soft_cap} · Hard cap R$ {hard_cap} (F5)
      </div>
    </div>
  );
}
