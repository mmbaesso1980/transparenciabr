## 2025-04-22 - [Three.js Object Instantiation Loop]
**Learning:** Re-instantiating objects (e.g., `new THREE.Color()`) inside repetitive loops like `useLayoutEffect` for `react-three-fiber` instanced meshes leads to high garbage collection overhead and potential frame drops.
**Action:** Hoist the object instantiation using `useMemo` and reuse the same instance (e.g., updating it with `.setStyle()`) during iteration to avoid memory churn.
## 2025-04-27 - [InstancedMesh High-Frequency Updates]
**Learning:** For `@react-three/fiber` `InstancedMesh` components, driving high-frequency updates like hover states (`onPointerOver`) via standard React state forces O(N) full-component re-renders (in this case, for hundreds of spheres), leading to huge frame drops and massive garbage collection latency.
**Action:** Use a mutable `useRef` to track hover state instead, and apply direct Three.js mesh mutations (e.g., `mesh.setMatrixAt` and `mesh.instanceMatrix.needsUpdate = true`) within the event handlers. This achieves O(1) mutations without triggering a React re-render cascade.
