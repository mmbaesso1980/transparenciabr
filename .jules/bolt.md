## 2025-04-22 - [Three.js Object Instantiation Loop]
**Learning:** Re-instantiating objects (e.g., `new THREE.Color()`) inside repetitive loops like `useLayoutEffect` for `react-three-fiber` instanced meshes leads to high garbage collection overhead and potential frame drops.
**Action:** Hoist the object instantiation using `useMemo` and reuse the same instance (e.g., updating it with `.setStyle()`) during iteration to avoid memory churn.
## 2025-04-22 - [React Three Fiber Native String Parsing Optimization]
**Learning:** In `@react-three/drei` `<Instance>` component render loops, you don't need to pass a `THREE.Color` object to the `color` prop. React Three Fiber's `applyProps` internally parses primitive strings (like `"hsl(x,y,z)"` or hex codes) and calls `.set()` on the underlying mesh instance property automatically.
**Action:** Always return primitive strings from mapping functions that populate Fiber `<Instance>` properties instead of allocating `new THREE.Color()` per node to eliminate GC stuttering during rapid loop execution.
