import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = [
  "#22d3ee",
  "#a78bfa",
  "#fbbf24",
  "#fb7185",
  "#34d399",
  "#60a5fa",
  "#f97316",
  "#e879f9",
];

const fmtBrl = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
};

/**
 * Normaliza linhas de despesa vindas de `politico.despesas` ou da API Câmara (useCEAPDetalhado).
 * @param {unknown[]} rows
 */
function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const valor = Number(
      r.valor ?? r.valorLiquido ?? r.valor_documento ?? r.valorDocumento ?? 0,
    );
    if (!Number.isFinite(valor) || valor <= 0) continue;
    const tipo =
      String(r.tipo_despesa ?? r.tipoDespesa ?? r.categoria ?? "Sem categoria").trim() ||
      "Sem categoria";
    const rawDate = String(
      r.data_emissao ?? r.dataDocumento ?? r.data ?? r.dataEmissao ?? "",
    ).trim();
    const ym =
      rawDate.length >= 7
        ? rawDate.slice(0, 7)
        : rawDate.length === 4
          ? `${rawDate}-01`
          : "";
    out.push({ valor, tipo_despesa: tipo, ym: ym || "—" });
  }
  return out;
}

/**
 * @param {{ politico?: Record<string, unknown>; ceapDet?: { despesas?: unknown[] } }} props
 */
export default function PoliticoAnalytics({ politico, ceapDet }) {
  const rows = useMemo(() => {
    const fromDoc = Array.isArray(politico?.despesas) ? politico.despesas : [];
    const normDoc = normalizeRows(fromDoc);
    if (normDoc.length > 0) return normDoc;
    return normalizeRows(ceapDet?.despesas || []);
  }, [politico, ceapDet]);

  const porMes = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      if (r.ym === "—") continue;
      map.set(r.ym, (map.get(r.ym) || 0) + r.valor);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, total]) => ({ mes, total }));
  }, [rows]);

  const porCategoria = useMemo(() => {
    const map = new Map();
    let sum = 0;
    for (const r of rows) {
      map.set(r.tipo_despesa, (map.get(r.tipo_despesa) || 0) + r.valor);
      sum += r.valor;
    }
    const arr = [...map.entries()]
      .map(([name, value]) => ({
        name,
        value,
        pct: sum > 0 ? Math.round((value / sum) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
    return { arr, sum };
  }, [rows]);

  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-white/10 bg-[#0D1117]/95 p-6 sm:p-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300">
          CEAP · séries forenses
        </p>
        <h2 className="mt-1 text-xl font-semibold text-white">Indicadores de gasto</h2>
        <p className="mt-2 text-sm text-[#8B949E]">
          Ainda não há despesas consolidadas neste perfil para montar gráficos. Quando o cadastro ou a API
          oficial trouxer notas CEAP, a evolução mensal e a distribuição por categoria aparecerão aqui.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0D1117]/95 p-6 sm:p-8">
      <header className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300">
          CEAP · séries forenses
        </p>
        <h2 className="mt-1 text-xl font-semibold text-white">Indicadores de gasto parlamentar</h2>
        <p className="mt-1 text-sm text-[#8B949E]">
          Fonte: registros CEAP associados a este mandato ({rows.length} lançamentos considerados). Valores
          somados por competência mensal e por categoria declarada.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="min-h-[280px]">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/70">
            Evolução mensal (valor reembolsado)
          </h3>
          {porMes.length === 0 ? (
            <p className="text-sm text-[#8B949E]">Datas incompletas — não foi possível agrupar por mês.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={porMes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
                <XAxis dataKey="mes" tick={{ fill: "#8B949E", fontSize: 11 }} />
                <YAxis
                  tick={{ fill: "#8B949E", fontSize: 11 }}
                  tickFormatter={(v) =>
                    Number(v).toLocaleString("pt-BR", { notation: "compact", compactDisplay: "short" })
                  }
                />
                <Tooltip
                  formatter={(value) => [fmtBrl(value), "Total"]}
                  labelFormatter={(l) => `Competência ${l}`}
                  contentStyle={{ background: "#111827", border: "1px solid #30363D", borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="total" stroke="#22d3ee" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="min-h-[280px]">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/70">
            Distribuição por categoria
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={porCategoria.arr}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={88}
                paddingAngle={2}
              >
                {porCategoria.arr.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="#0D1117" strokeWidth={1} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, _n, p) => {
                  const pct = p?.payload?.pct;
                  return [`${fmtBrl(value)} (${pct}%)`, "Valor"];
                }}
                contentStyle={{ background: "#111827", border: "1px solid #30363D", borderRadius: 8 }}
              />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                formatter={(value) => (
                  <span className="text-[11px] text-[#C9D1D9]">{String(value).slice(0, 42)}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-8 min-h-[220px]">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/70">
          Barras — top categorias (R$)
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={porCategoria.arr.slice(0, 8)} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
            <XAxis
              dataKey="name"
              tick={{ fill: "#8B949E", fontSize: 10 }}
              interval={0}
              angle={-18}
              textAnchor="end"
              height={70}
            />
            <YAxis
              tick={{ fill: "#8B949E", fontSize: 11 }}
              tickFormatter={(v) =>
                Number(v).toLocaleString("pt-BR", { notation: "compact", compactDisplay: "short" })
              }
            />
            <Tooltip
              formatter={(value) => [fmtBrl(value), "Total"]}
              contentStyle={{ background: "#111827", border: "1px solid #30363D", borderRadius: 8 }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {porCategoria.arr.slice(0, 8).map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
