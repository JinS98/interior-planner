import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { LayoutObject, Room } from '../../types/layout';
import { createFloorPreviewModel, previewContentBounds } from './model';
import { createFloorMeshes, disposeFloorMeshes, WALL_HEIGHT_METERS } from './mesh';
import { createObjectMeshes, disposeObjectMeshes } from './objectMeshes';
import styles from './ThreeFloorPreview.module.scss';

export default function ThreeFloorPreview({
  rooms,
  objects,
}: {
  rooms: Room[];
  objects: LayoutObject[];
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const model = useMemo(() => createFloorPreviewModel(rooms), [rooms]);
  const bounds = useMemo(() => previewContentBounds(model, objects), [model, objects]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !bounds) return;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', '공간 3D 미리보기');
    canvas.setAttribute('role', 'img');
    host.appendChild(canvas);
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let meshes: THREE.Group | null = null;
    let objectMeshes: THREE.Group | null = null;
    let observer: ResizeObserver | null = null;

    try {
      if (!canvas.getContext('webgl2', { antialias: true })) throw new Error('WebGL2 unavailable');
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0xf7f9fd);

      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c8df, 2.2));
      const sunlight = new THREE.DirectionalLight(0xffffff, 2.4);
      sunlight.position.set(-3, 8, 5);
      scene.add(sunlight);
      meshes = createFloorMeshes(model, objects);
      scene.add(meshes);
      objectMeshes = createObjectMeshes(objects, rooms);
      scene.add(objectMeshes);

      const { minX, maxX, minY, maxY } = bounds;
      const span = Math.max(maxX - minX, maxY - minY, 3);
      const centerX = (minX + maxX) / 2;
      const centerZ = (minY + maxY) / 2;
      const camera = new THREE.PerspectiveCamera(45, 1, 0.05, Math.max(200, span * 30));
      camera.position.set(
        centerX + span * 1.15,
        WALL_HEIGHT_METERS + span * 1.1,
        centerZ + span * 1.3,
      );
      controls = new OrbitControls(camera, canvas);
      controls.target.set(centerX, WALL_HEIGHT_METERS * 0.4, centerZ);
      controls.minDistance = Math.max(1, span * 0.35);
      controls.maxDistance = span * 12;
      controls.maxPolarAngle = Math.PI * 0.49;
      controls.update();
      controls.saveState();
      controlsRef.current = controls;

      const render = () => renderer?.render(scene, camera);
      const resize = () => {
        if (!renderer) return;
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        render();
      };
      controls.addEventListener('change', render);
      observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
    } catch {
      setError('이 브라우저에서 3D 화면을 열 수 없습니다. WebGL2 지원을 확인해 주세요.');
    }

    return () => {
      observer?.disconnect();
      controls?.dispose();
      if (controlsRef.current === controls) controlsRef.current = null;
      if (meshes) disposeFloorMeshes(meshes);
      if (objectMeshes) disposeObjectMeshes(objectMeshes);
      renderer?.dispose();
      renderer?.forceContextLoss();
      canvas.remove();
    };
  }, [model, objects, rooms, bounds]);

  if (!bounds) {
    return (
      <div className={styles.empty}>이 층에 공간이나 물품을 추가하면 3D 미리보기가 표시됩니다.</div>
    );
  }

  return (
    <div
      className={styles.preview}
      aria-label={`3D 미리보기, 공간 ${model.rooms.length}개, 물품 ${objects.length}개`}
    >
      <div className={styles.canvasHost} ref={hostRef} />
      {!error && (
        <button
          type="button"
          className={styles.resetView}
          onClick={() => controlsRef.current?.reset()}
          title="회전·확대·이동을 처음 시점으로 되돌립니다"
        >
          시점 초기화
        </button>
      )}
      {error ? (
        <p className={styles.message} role="alert">
          {error}
        </p>
      ) : (
        <p className={styles.hint}>
          읽기 전용 · 왼쪽 드래그 회전 · 휠 확대/축소 · 오른쪽 드래그 이동
        </p>
      )}
    </div>
  );
}
