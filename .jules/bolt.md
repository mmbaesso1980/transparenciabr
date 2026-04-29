## 2025-04-22 - [Three.js Object Instantiation Loop]
**Learning:** Re-instantiating objects (e.g., `new THREE.Color()`) inside repetitive loops like `useLayoutEffect` for `react-three-fiber` instanced meshes leads to high garbage collection overhead and potential frame drops.
**Action:** Hoist the object instantiation using `useMemo` and reuse the same instance (e.g., updating it with `.setStyle()`) during iteration to avoid memory churn.

## 2025-04-29 - [Three.js Object Instantiation Loop Avoidance via Native Color Strings]
**Learning:** Re-instantiating `THREE.Color` directly in `nodes.map` loops for `@react-three/drei`'s `<Instance>` components causes significant garbage collection overhead. `<Instance>` natively supports CSS color strings (like `hsl()`, `hex`), avoiding the need for `new THREE.Color()` entirely.
**Action:** Always prefer returning CSS string color formats (like `hsl()` or hex) for `<Instance color={...} />` loops rather than allocating `new THREE.Color()` per node.
