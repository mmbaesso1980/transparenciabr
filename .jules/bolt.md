## 2026-04-20 - Memoization of THREE.Color in InstancedSpheres (react-three-fiber)
**Learning:** Re-instantiating `new THREE.Color()` inside a loop that updates `InstancedMesh` attributes per element can lead to unnecessary garbage collection overhead when the number of instances is large (e.g., thousands of spheres).
**Action:** Lift the object creation out of the loop and reuse a single `tempColor` instance by applying `.setStyle()` on it, just like `temp` (a `THREE.Object3D`) is reused for positions and scales.
