## 2025-04-22 - [Three.js Object Instantiation Loop]
**Learning:** Re-instantiating objects (e.g., `new THREE.Color()`) inside repetitive loops like `useLayoutEffect` for `react-three-fiber` instanced meshes leads to high garbage collection overhead and potential frame drops.
**Action:** Hoist the object instantiation using `useMemo` and reuse the same instance (e.g., updating it with `.setStyle()`) during iteration to avoid memory churn.
