import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { screenToWorld, worldToScreen } from '../../domain/geometry/coordinates';
import { useEditorStore } from '../../store/editorStore';
import type { Point, Viewport } from '../../types/layout';
import styles from './EditorCanvas.module.scss';

const MIN_SCALE = 20;
const MAX_SCALE = 400;

function useSpaceKey() {
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return;
      if (event.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName))
        return;
      event.preventDefault();
      setPressed(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setPressed(false);
    };
    const blur = () => setPressed(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
  return pressed;
}

export function EditorCanvas() {
  const viewport = useEditorStore((state) => state.viewport);
  const setViewport = useEditorStore((state) => state.setViewport);
  const tool = useEditorStore((state) => state.tool);
  const spacePressed = useSpaceKey();
  const drag = useRef<{ pointerId: number; point: Point; viewport: Viewport } | null>(null);
  const [cursorWorld, setCursorWorld] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  function localPoint(event: {
    clientX: number;
    clientY: number;
    currentTarget: HTMLElement;
  }): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const point = localPoint(event);
    const world = screenToWorld(point, viewport);
    const scale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, viewport.scale * Math.exp(-event.deltaY * 0.001)),
    );
    const offset = worldToScreen(world, { x: 0, y: 0, scale });
    setViewport({ scale, x: point.x - offset.x, y: point.y - offset.y });
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!(event.button === 1 || (event.button === 0 && (spacePressed || tool === 'pan')))) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, point: localPoint(event), viewport };
    setDragging(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const point = localPoint(event);
    const currentDrag = drag.current;
    if (currentDrag?.pointerId === event.pointerId) {
      setViewport({
        ...currentDrag.viewport,
        x: currentDrag.viewport.x + point.x - currentDrag.point.x,
        y: currentDrag.viewport.y + point.y - currentDrag.point.y,
      });
    } else {
      setCursorWorld(screenToWorld(point, viewport));
    }
  }

  function finishDrag() {
    drag.current = null;
    setDragging(false);
  }

  return (
    <div className={styles.wrapper}>
      <div
        aria-label="도면 편집 영역"
        className={`${styles.canvas} ${dragging ? styles.dragging : ''} ${spacePressed || tool === 'pan' ? styles.pan : ''}`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
        style={{
          backgroundSize: `${viewport.scale}px ${viewport.scale}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        }}
      >
        <div className={styles.origin} style={{ left: viewport.x, top: viewport.y }} />
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>◇</span>
          <strong>새 도면을 시작할 준비가 됐어요</strong>
          <span>휠로 확대·축소하고, Space + 드래그로 이동해 보세요.</span>
          <small>공간 그리기는 2일차에 연결됩니다.</small>
        </div>
      </div>
      <div className={styles.status}>
        <span>1칸 = 1m</span>
        <span>
          좌표 {cursorWorld.x.toFixed(1)}m, {cursorWorld.y.toFixed(1)}m
        </span>
        <span>{Math.round((viewport.scale / 80) * 100)}%</span>
      </div>
    </div>
  );
}
