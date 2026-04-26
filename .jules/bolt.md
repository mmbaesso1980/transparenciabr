## 2025-04-22 - [Three.js Object Instantiation Loop]
**Learning:** Re-instantiating objects (e.g., `new THREE.Color()`) inside repetitive loops like `useLayoutEffect` for `react-three-fiber` instanced meshes leads to high garbage collection overhead and potential frame drops.
**Action:** Hoist the object instantiation using `useMemo` and reuse the same instance (e.g., updating it with `.setStyle()`) during iteration to avoid memory churn.
## 2025-04-26 - [React Three Fiber InstancedMesh Hover Performance]
**Learning:** For `@react-three/fiber` `InstancedMesh` components handling many instances, triggering hover states via React state (`useState`) forces O(N) full-component re-renders (where N is the maximum count of instances).
**Action:** Instead, use a mutable `useRef` to track hover state and apply direct mesh mutations (e.g., `mesh.setMatrixAt` and setting `mesh.instanceMatrix.needsUpdate = true`) via `useCallback` event handlers, bypassing the React render cycle entirely for O(1) hover updates.
