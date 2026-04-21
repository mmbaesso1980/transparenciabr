import { useEffect, useLayoutEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { registerPmtilesProtocolOnce } from "../lib/pmtilesMaplibre.js";
import { getRiskHex } from "../utils/colorUtils.js";

const BG_VOID = "#080b14";

/**
 * Constrói expressão MapLibre `match` ou cor única para choropleth por município.
 */
function buildFillColorPaint(riskScore, municipalityRiskMap, geoProperty) {
  const fallback = Number.isFinite(Number(riskScore))
    ? Number(riskScore)
    : 50;
  const defaultHex = getRiskHex(fallback);

  if (
    !municipalityRiskMap ||
    typeof municipalityRiskMap !== "object" ||
    Object.keys(municipalityRiskMap).length === 0
  ) {
    return defaultHex;
  }

  const stops = [];
  for (const [code, rawScore] of Object.entries(municipalityRiskMap)) {
    stops.push(String(code), getRiskHex(Number(rawScore)));
  }
  return ["match", ["to-string", ["get", geoProperty]], ...stops, defaultHex];
}

/**
 * Mapa vetorial Brasil — MapLibre + PMTiles (protocolo registado uma vez na app).
 *
 * @param {{
 *   embedded?: boolean;
 *   riskScore?: number | null;
 *   municipalityRiskMap?: Record<string, number>;
 *   geoProperty?: string;
 * }} props
 */
export default function BrazilHeatmap({
  embedded = false,
  riskScore = null,
  municipalityRiskMap,
  geoProperty = "CD_MUN",
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const styleReadyRef = useRef(false);
  const latestPaintRef = useRef({
    riskScore,
    municipalityRiskMap,
    geoProperty,
  });
  const [layerError, setLayerError] = useState(null);

  useLayoutEffect(() => {
    latestPaintRef.current = { riskScore, municipalityRiskMap, geoProperty };
  });

  const tileUrl = import.meta.env.VITE_BR_PM_TILES_URL?.trim() || "";
  const sourceLayer =
    import.meta.env.VITE_PM_TILES_SOURCE_LAYER?.trim() || "municipios";

  useEffect(() => {
    if (!tileUrl || !containerRef.current) return undefined;

    registerPmtilesProtocolOnce();

    const map = new maplibregl.Map({
      container: containerRef.current,
      attributionControl: false,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {},
        layers: [
          {
            id: "bg",
            type: "background",
            paint: { "background-color": BG_VOID },
          },
        ],
      },
      center: [-54, -14.5],
      zoom: 3.85,
      minZoom: 2,
      maxZoom: 18,
    });

    mapRef.current = map;
    styleReadyRef.current = false;

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    const onLoad = () => {
      try {
        map.addSource("munis", {
          type: "vector",
          url: `pmtiles://${tileUrl}`,
        });

        const { riskScore: rs, municipalityRiskMap: mm, geoProperty: gp } =
          latestPaintRef.current;
        const fillPaint = buildFillColorPaint(rs, mm, gp);

        map.addLayer({
          id: "munis-fill",
          type: "fill",
          source: "munis",
          "source-layer": sourceLayer,
          paint: {
            "fill-color": fillPaint,
            "fill-opacity": 0.42,
          },
        });

        map.addLayer({
          id: "munis-outline",
          type: "line",
          source: "munis",
          "source-layer": sourceLayer,
          paint: {
            "line-color": "rgba(148,163,184,0.35)",
            "line-width": 0.45,
          },
        });

        styleReadyRef.current = true;
        map.resize();
      } catch (err) {
        console.error(err);
        setLayerError(err instanceof Error ? err.message : String(err));
      }
    };

    map.on("load", onLoad);

    return () => {
      map.off("load", onLoad);
      map.remove();
      mapRef.current = null;
      styleReadyRef.current = false;
    };
  }, [tileUrl, sourceLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReadyRef.current) return;

    const apply = () => {
      if (!map.getLayer("munis-fill")) return;
      const { riskScore: rs, municipalityRiskMap: mm, geoProperty: gp } =
        latestPaintRef.current;
      const fillPaint = buildFillColorPaint(rs, mm, gp);
      map.setPaintProperty("munis-fill", "fill-color", fillPaint);
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("styledata", apply);
    }
  }, [riskScore, municipalityRiskMap, geoProperty]);

  useEffect(() => {
    if (!mapRef.current || !tileUrl) return;
    const ro = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [tileUrl]);

  const placeholderClass = embedded
    ? "flex min-h-[220px] h-full w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[#30363D] bg-[#0D1117] px-5 py-10 text-center"
    : "flex min-h-[320px] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-deep)] px-6 py-12 text-center";

  if (!tileUrl) {
    return (
      <div className={placeholderClass} style={{ backgroundColor: BG_VOID }}>
        <p className="text-sm font-semibold text-[#F0F4FC]">
          Camada geoespacial
        </p>
        <p className="max-w-md text-xs leading-relaxed text-[#8B949E]">
          Configure a variável{" "}
          <span className="font-mono text-[#58A6FF]">VITE_BR_PM_TILES_URL</span>{" "}
          para ativar o mapa vetorial nacional neste painel.
        </p>
        <div
          className="mt-2 h-24 w-full max-w-sm rounded-md opacity-90"
          style={{
            background:
              "linear-gradient(180deg, rgba(88,166,255,0.15) 0%, transparent 60%), repeating-linear-gradient(90deg, #21262D 0, #21262D 1px, transparent 1px, transparent 12px), repeating-linear-gradient(0deg, #21262D 0, #21262D 1px, transparent 1px, transparent 12px)",
          }}
          aria-hidden="true"
        />
      </div>
    );
  }

  const outerClass = embedded
    ? "relative flex h-full min-h-0 w-full flex-col"
    : "relative w-full";

  const mapBoxClass = embedded
    ? "w-full flex-1 min-h-0 overflow-hidden rounded-lg border border-[#30363D]"
    : "w-full overflow-hidden rounded-2xl border border-[var(--border-subtle)]";

  const mapBoxStyle = embedded
    ? { minHeight: 0, height: "100%", background: BG_VOID }
    : {
        height: "min(65vh, 480px)",
        background: BG_VOID,
      };

  return (
    <div className={outerClass}>
      {layerError ? (
        <div className="absolute left-3 top-3 z-10 max-w-sm rounded-md border border-[#f85149]/50 bg-[#0D1117]/95 px-3 py-2 text-[11px] text-[#F0F4FC] shadow-lg backdrop-blur-sm">
          <span className="font-semibold text-[#f85149]">Camada</span>{" "}
          {layerError}
        </div>
      ) : null}
      <div ref={containerRef} className={mapBoxClass} style={mapBoxStyle} />
    </div>
  );
}
