import { useMemo } from "react";
import * as THREE from "three";

/**
 * Campo estelar de fundo — distribuição esférica em casca grossa
 * (radius .. 2*radius). Cada estrela tem leve variação de cor entre
 * branco quente e azul-pálido, e magnitude (size) aleatória pequena.
 *
 * Renderizado como Points + PointsMaterial com sizeAttenuation.
 * Não interage com luz/sombra; é literalmente "ruído cósmico" estático.
 */
export default function StarField({ count = 3000, radius = 150 }) {
  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const palette = [
      new THREE.Color("#ffffff"),
      new THREE.Color("#e6f0ff"),
      new THREE.Color("#fff5d6"),
      new THREE.Color("#ffd9b3"),
      new THREE.Color("#cdd9ff"),
    ];
    for (let i = 0; i < count; i++) {
      const r = radius * (0.6 + Math.random() * 0.7);
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const sinPhi = Math.sin(phi);
      pos[i * 3] = r * sinPhi * Math.cos(theta);
      pos[i * 3 + 1] = r * sinPhi * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      const c = palette[Math.floor(Math.random() * palette.length)];
      // brilho variável (magnitude aparente)
      const brightness = 0.45 + Math.random() * 0.55;
      col[i * 3] = c.r * brightness;
      col[i * 3 + 1] = c.g * brightness;
      col[i * 3 + 2] = c.b * brightness;
    }
    return { positions: pos, colors: col };
  }, [count, radius]);

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={count}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.55}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0.85}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
