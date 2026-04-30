/**
 * Landing grafo — motor WebGL InstancedMesh (R3F), sem react-force-graph/workers.
 */
import { forwardRef } from "react";

import OrbMeshScene from "../graph/OrbMeshScene.jsx";

const LandingHeroGraph = forwardRef(function LandingHeroGraph(props, ref) {
  return <OrbMeshScene ref={ref} {...props} />;
});

export default LandingHeroGraph;
