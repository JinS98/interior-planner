import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { screenToWorld, worldToScreen } from '../../domain/geometry/coordinates';
import { snapRightAngle } from '../../domain/geometry/angles';
import { LayoutObjectShape } from '../../components/editor/LayoutObjectShape';
import { NumericTextInput } from '../../components/inputs/NumericTextInput';
import {
  DEFAULT_OBJECT_ARRAY,
  isValidObjectArray,
  objectArrayCenters,
  objectArrayFootprint,
  type ObjectArrayOptions,
} from './array';
import {
  layoutObjectFromPaletteItem,
  MAX_OBJECT_SIZE_METERS,
  MIN_OBJECT_SIZE_METERS,
  OBJECT_SHAPES,
} from './catalog';
import {
  commitBuilderEdit,
  EMPTY_BUILDER_HISTORY,
  finishBuilderGesture,
  previewBuilderEdit,
  redoBuilderEdit,
  undoBuilderEdit,
} from './builderHistory';
import {
  normalizeObjectRotation,
  objectCenter,
  resizeObjectFromScreenDrag,
  rotatePoint,
  rotateObjectFromScreenDrag,
} from './edit';
import {
  hitTestLayoutObject,
  isNearObjectResizeHandle,
  isNearObjectRotationHandle,
  objectResizeHandlePoint,
  objectRotationHandlePoint,
} from './hitTest';
import { snapObjectPlacement, type ObjectPlacementSnap } from './snap';
import { objectsInSelectionRect, selectionRectBetween } from './selection';
import type { LayoutObject, PaletteItem, Point, Viewport } from '../../types/layout';
import styles from './SetBuilder.module.scss';

const BOARD_WIDTH = 600;
const BOARD_HEIGHT = 420;
const VIEWPORT: Viewport = { x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2, scale: 70 };

function roundMeters(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function sharedNumber(
  objects: LayoutObject[],
  field: 'width' | 'height' | 'rotation',
): number | null {
  const first = objects[0]?.[field];
  return objects.every((object) => object[field] === first) ? first : null;
}

function snapDescription(snap: ObjectPlacementSnap | null): string {
  if (!snap) return '물품을 고른 뒤 작업판을 클릭하세요.';
  if (snap.gapGuide) return `같은 간격 ${Number(snap.gapGuide.meters.toFixed(2))}m`;
  if (snap.startLineGuide) return '배열 시작선에 맞춤';
  if (snap.horizontalReference && snap.verticalReference) return '가로·세로 정렬';
  if (snap.horizontalReference) return '가로 정렬';
  if (snap.verticalReference) return '세로 정렬';
  if (snap.grid) return '격자에 맞춤';
  return '클릭하여 배치';
}

export function SetBuilder({
  items,
  onSave,
  onClose,
}: {
  items: PaletteItem[];
  onSave: (name: string, objects: LayoutObject[]) => boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [history, setHistory] = useState(EMPTY_BUILDER_HISTORY);
  const objects = history.present;
  const [arrayOptions, setArrayOptions] = useState<ObjectArrayOptions>(DEFAULT_OBJECT_ARRAY);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [marqueeRect, setMarqueeRect] = useState<{ start: Point; current: Point } | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [dragSnap, setDragSnap] = useState<ObjectPlacementSnap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{
    pointerId: number;
    objectId: string;
    mode: 'move' | 'resize' | 'rotate';
    start: Point;
    original: LayoutObject;
    movingIds: string[];
    before: LayoutObject[];
  } | null>(null);
  const marquee = useRef<{
    pointerId: number;
    start: Point;
    selectedBefore: string[];
    additive: boolean;
  } | null>(null);
  const selectedObjects = objects.filter((object) => selectedIds.includes(object.id));
  const selected = selectedObjects.length === 1 ? selectedObjects[0] : null;
  const sameTypeSelection =
    selectedObjects.length > 1 &&
    selectedObjects.every((object) => object.type === selectedObjects[0].type);
  const selectedTop = selected
    ? worldToScreen(
        rotatePoint(
          { x: selected.x + selected.width / 2, y: selected.y },
          objectCenter(selected),
          selected.rotation,
        ),
        VIEWPORT,
      )
    : null;
  const activeItem = items.find((item) => item.id === activeItemId);
  const previewSnap =
    activeItem && hoverPoint && !drag.current && !marquee.current
      ? snapObjectPlacement(
          hoverPoint,
          VIEWPORT,
          objects,
          objectArrayFootprint(activeItem, arrayOptions),
        )
      : null;
  const previewObjects =
    activeItem && previewSnap
      ? objectArrayCenters(previewSnap.center, activeItem, arrayOptions).map((center, index) =>
          layoutObjectFromPaletteItem('set-builder', activeItem, center, `preview-${index}`),
        )
      : [];
  const visibleSnap = dragSnap ?? previewSnap;
  const snapScreen = visibleSnap ? worldToScreen(visibleSnap.center, VIEWPORT) : null;

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      event.preventDefault();
      event.stopPropagation();
      setSelectedIds([]);
      setActiveItemId(null);
      setHoverPoint(null);
      setDragSnap(null);
      setMarqueeRect(null);
      marquee.current = null;
      const before = drag.current?.before;
      if (before) setHistory((current) => previewBuilderEdit(current, before));
      drag.current = null;
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, []);

  function boardPoint(event: PointerEvent<SVGSVGElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * BOARD_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * BOARD_HEIGHT,
    };
  }

  function updateSelected(patch: Partial<LayoutObject>) {
    if (!selected) return;
    setHistory((current) =>
      commitBuilderEdit(
        current,
        current.present.map((object) =>
          object.id === selected.id ? { ...object, ...patch } : object,
        ),
      ),
    );
  }

  function updateSelectedGroup(change: (object: LayoutObject) => LayoutObject) {
    if (!sameTypeSelection) return;
    const selectedSet = new Set(selectedIds);
    setHistory((current) =>
      commitBuilderEdit(
        current,
        current.present.map((object) => (selectedSet.has(object.id) ? change(object) : object)),
      ),
    );
  }

  function removeSelected() {
    if (selectedIds.length === 0) return;
    const selectedSet = new Set(selectedIds);
    setHistory((current) =>
      commitBuilderEdit(
        current,
        current.present.filter((object) => !selectedSet.has(object.id)),
      ),
    );
    setSelectedIds([]);
  }

  function duplicateSelected() {
    if (selectedObjects.length === 0 || objects.length + selectedObjects.length > 100) return;
    const copies = selectedObjects.map((object) => ({
      ...object,
      id: crypto.randomUUID(),
      x: roundMeters(object.x + 0.2),
      y: roundMeters(object.y + 0.2),
    }));
    setHistory((current) => commitBuilderEdit(current, [...current.present, ...copies]));
    setSelectedIds(copies.map((object) => object.id));
  }

  function undoEdit() {
    setHistory(undoBuilderEdit);
    setSelectedIds([]);
    setDragSnap(null);
  }

  function redoEdit() {
    setHistory(redoBuilderEdit);
    setSelectedIds([]);
    setDragSnap(null);
  }

  function updateArray(patch: Partial<ObjectArrayOptions>) {
    setArrayOptions((current) => {
      const next = { ...current, ...patch };
      return isValidObjectArray(next) ? next : current;
    });
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    event.currentTarget.focus();
    const point = boardPoint(event);
    if (selected && !event.shiftKey) {
      const mode = isNearObjectRotationHandle(selected, point, VIEWPORT)
        ? 'rotate'
        : isNearObjectResizeHandle(selected, point, VIEWPORT)
          ? 'resize'
          : null;
      if (mode) {
        drag.current = {
          pointerId: event.pointerId,
          objectId: selected.id,
          mode,
          start: point,
          original: selected,
          movingIds: [selected.id],
          before: objects,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        setHoverPoint(null);
        return;
      }
    }
    const hit = hitTestLayoutObject(objects, point, VIEWPORT);
    if (hit) {
      setActiveItemId(null);
      if (event.shiftKey) {
        setSelectedIds((current) =>
          current.includes(hit.id) ? current.filter((id) => id !== hit.id) : [...current, hit.id],
        );
        setHoverPoint(null);
        return;
      }
      const movingIds = selectedIds.includes(hit.id) ? selectedIds : [hit.id];
      setSelectedIds(movingIds);
      setHoverPoint(null);
      drag.current = {
        pointerId: event.pointerId,
        objectId: hit.id,
        mode: 'move',
        start: point,
        original: hit,
        movingIds,
        before: objects,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (!activeItem || event.shiftKey) {
      marquee.current = {
        pointerId: event.pointerId,
        start: point,
        selectedBefore: selectedIds,
        additive: event.shiftKey,
      };
      setMarqueeRect({ start: point, current: point });
      setHoverPoint(null);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const count = arrayOptions.columns * arrayOptions.rows;
    if (objects.length + count > 100) {
      setError('세트에는 물품을 최대 100개까지 넣을 수 있습니다.');
      return;
    }
    const snap = snapObjectPlacement(
      point,
      VIEWPORT,
      objects,
      objectArrayFootprint(activeItem, arrayOptions),
    );
    const created = objectArrayCenters(snap.center, activeItem, arrayOptions).map((center) =>
      layoutObjectFromPaletteItem(
        'set-builder',
        activeItem,
        { x: roundMeters(center.x), y: roundMeters(center.y) },
        crypto.randomUUID(),
      ),
    );
    setHistory((current) => commitBuilderEdit(current, [...current.present, ...created]));
    setSelectedIds(created.map((object) => object.id));
    setHoverPoint(point);
    setError(null);
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const currentDrag = drag.current;
    const point = boardPoint(event);
    if (marquee.current?.pointerId === event.pointerId) {
      setMarqueeRect({ start: marquee.current.start, current: point });
      return;
    }
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) {
      setHoverPoint(point);
      return;
    }
    if (currentDrag.mode === 'resize' || currentDrag.mode === 'rotate') {
      const candidate =
        currentDrag.mode === 'resize'
          ? resizeObjectFromScreenDrag(currentDrag.original, currentDrag.start, point, VIEWPORT)
          : rotateObjectFromScreenDrag(currentDrag.original, currentDrag.start, point, VIEWPORT);
      setHistory((current) =>
        previewBuilderEdit(
          current,
          current.present.map((object) =>
            object.id === currentDrag.objectId ? candidate : object,
          ),
        ),
      );
      setDragSnap(null);
      return;
    }
    const delta = screenToWorld(
      { x: point.x - currentDrag.start.x, y: point.y - currentDrag.start.y },
      { x: 0, y: 0, scale: VIEWPORT.scale },
    );
    const moving = currentDrag.original;
    const rawCenter = {
      x: moving.x + delta.x + moving.width / 2,
      y: moving.y + delta.y + moving.height / 2,
    };
    const movingSet = new Set(currentDrag.movingIds);
    const snap = snapObjectPlacement(
      worldToScreen(rawCenter, VIEWPORT),
      VIEWPORT,
      currentDrag.before.filter((object) => !movingSet.has(object.id)),
      moving,
    );
    setDragSnap(snap);
    const snappedDelta = {
      x: snap.center.x - (moving.x + moving.width / 2),
      y: snap.center.y - (moving.y + moving.height / 2),
    };
    setHistory((current) =>
      previewBuilderEdit(
        current,
        currentDrag.before.map((object) =>
          movingSet.has(object.id)
            ? {
                ...object,
                x: roundMeters(object.x + snappedDelta.x),
                y: roundMeters(object.y + snappedDelta.y),
              }
            : object,
        ),
      ),
    );
  }

  function finishPointer(event: PointerEvent<SVGSVGElement>, cancelled: boolean) {
    const currentMarquee = marquee.current;
    if (currentMarquee?.pointerId === event.pointerId) {
      if (!cancelled) {
        const point = boardPoint(event);
        const moved =
          Math.hypot(point.x - currentMarquee.start.x, point.y - currentMarquee.start.y) >= 4;
        const hitIds = moved
          ? objectsInSelectionRect(
              objects,
              selectionRectBetween(currentMarquee.start, point),
              VIEWPORT,
            )
          : [];
        setSelectedIds(
          currentMarquee.additive
            ? [...new Set([...currentMarquee.selectedBefore, ...hitIds])]
            : hitIds,
        );
      }
      marquee.current = null;
      setMarqueeRect(null);
    }
    const before = drag.current?.pointerId === event.pointerId ? drag.current.before : null;
    if (before) {
      setHistory((current) =>
        cancelled ? previewBuilderEdit(current, before) : finishBuilderGesture(current, before),
      );
      drag.current = null;
      setDragSnap(null);
    }
  }

  return (
    <div className={styles.backdrop}>
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="내 세트 만들기"
        onKeyDownCapture={(event) => {
          const target = event.target;
          const editingText =
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            (target instanceof HTMLElement && target.isContentEditable);
          if (editingText) return;
          const command = (event.ctrlKey || event.metaKey) && !event.altKey;
          const key = event.key.toLowerCase();
          if (command && key === 'a') {
            event.preventDefault();
            event.stopPropagation();
            setSelectedIds(objects.map((object) => object.id));
            setActiveItemId(null);
            return;
          }
          if (command && key === 'd') {
            event.preventDefault();
            event.stopPropagation();
            duplicateSelected();
            return;
          }
          if (command && (key === 'z' || key === 'y')) {
            event.preventDefault();
            event.stopPropagation();
            if (drag.current) {
              const before = drag.current.before;
              setHistory((current) => previewBuilderEdit(current, before));
              drag.current = null;
              setDragSnap(null);
            } else if (key === 'y' || event.shiftKey) redoEdit();
            else undoEdit();
            return;
          }
          event.stopPropagation();
          if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length > 0) {
            event.preventDefault();
            removeSelected();
          }
        }}
      >
        <header className={styles.header}>
          <div>
            <h2>내 세트 만들기</h2>
            <p>
              물품을 골라 배치하세요. Shift+클릭 또는 선택 모드에서 빈 곳 드래그로 여러 개를
              선택하고 함께 이동할 수 있습니다. Ctrl/Cmd+A 전체 선택 · Ctrl/Cmd+D 복제 · Ctrl/Cmd+Z
              되돌리기 · Backspace/Delete 삭제 · Esc 선택 해제
            </p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" disabled={history.past.length === 0} onClick={undoEdit}>
              되돌리기
            </button>
            <button type="button" disabled={history.future.length === 0} onClick={redoEdit}>
              다시 실행
            </button>
            <button type="button" onClick={onClose} aria-label="세트 만들기 닫기">
              ×
            </button>
          </div>
        </header>
        <div className={styles.content}>
          <aside className={styles.itemList} aria-label="세트에 넣을 물품">
            <h3>물품 선택</h3>
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={activeItemId === item.id}
                onClick={() => {
                  setActiveItemId(item.id);
                  setSelectedIds([]);
                }}
              >
                <span>{item.name}</span>
                <small>
                  {item.width} × {item.height}m
                </small>
              </button>
            ))}
            <fieldset className={styles.arrayControls}>
              <legend>한 번에 배치</legend>
              <label>
                가로 개수
                <NumericTextInput
                  value={arrayOptions.columns}
                  min={1}
                  max={Math.floor(100 / arrayOptions.rows)}
                  integer
                  onCommit={(columns) => updateArray({ columns })}
                />
              </label>
              <label>
                세로 개수
                <NumericTextInput
                  value={arrayOptions.rows}
                  min={1}
                  max={Math.floor(100 / arrayOptions.columns)}
                  integer
                  onCommit={(rows) => updateArray({ rows })}
                />
              </label>
              <label>
                가로 간격 (m)
                <NumericTextInput
                  min={0}
                  max={20}
                  value={arrayOptions.gapX}
                  onCommit={(gapX) => updateArray({ gapX })}
                />
              </label>
              <label>
                세로 간격 (m)
                <NumericTextInput
                  min={0}
                  max={20}
                  value={arrayOptions.gapY}
                  onCommit={(gapY) => updateArray({ gapY })}
                />
              </label>
            </fieldset>
          </aside>
          <div className={styles.boardArea}>
            <div className={styles.boardToolbar}>
              <button
                type="button"
                aria-pressed={!activeItemId}
                onClick={() => {
                  setActiveItemId(null);
                  setHoverPoint(null);
                }}
              >
                선택 모드
              </button>
              <span>{selectedIds.length > 0 ? `${selectedIds.length}개 선택` : '선택 없음'}</span>
            </div>
            <svg
              tabIndex={0}
              className={styles.board}
              viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
              role="img"
              aria-label={`세트 작업판, 배치한 물품 ${objects.length}개`}
              onContextMenu={(event) => {
                event.preventDefault();
                setSelectedIds([]);
                setActiveItemId(null);
                setHoverPoint(null);
                marquee.current = null;
                setMarqueeRect(null);
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={(event) => finishPointer(event, false)}
              onPointerCancel={(event) => finishPointer(event, true)}
              onLostPointerCapture={(event) => finishPointer(event, true)}
              onPointerLeave={() => setHoverPoint(null)}
            >
              <defs>
                <pattern id="set-builder-grid" width="70" height="70" patternUnits="userSpaceOnUse">
                  <path d="M 70 0 L 0 0 0 70" fill="none" stroke="#e2e7f1" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="#f8faff" />
              <rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="url(#set-builder-grid)" />
              {objects.map((object) => (
                <LayoutObjectShape key={object.id} object={object} viewport={VIEWPORT} />
              ))}
              {marqueeRect && (
                <rect
                  className={styles.marqueeSelection}
                  x={Math.min(marqueeRect.start.x, marqueeRect.current.x)}
                  y={Math.min(marqueeRect.start.y, marqueeRect.current.y)}
                  width={Math.abs(marqueeRect.current.x - marqueeRect.start.x)}
                  height={Math.abs(marqueeRect.current.y - marqueeRect.start.y)}
                  pointerEvents="none"
                />
              )}
              <g opacity="0.55" pointerEvents="none">
                {previewObjects.map((object) => (
                  <LayoutObjectShape key={object.id} object={object} viewport={VIEWPORT} preview />
                ))}
              </g>
              {visibleSnap && snapScreen && (
                <g className={styles.snapGuide} pointerEvents="none">
                  {visibleSnap.horizontalReference && (
                    <line
                      x1={worldToScreen(visibleSnap.horizontalReference, VIEWPORT).x}
                      y1={snapScreen.y}
                      x2={snapScreen.x}
                      y2={snapScreen.y}
                    />
                  )}
                  {visibleSnap.verticalReference && (
                    <line
                      x1={snapScreen.x}
                      y1={worldToScreen(visibleSnap.verticalReference, VIEWPORT).y}
                      x2={snapScreen.x}
                      y2={snapScreen.y}
                    />
                  )}
                  {visibleSnap.startLineGuide && (
                    <line
                      className={styles.startLineGuide}
                      x1={worldToScreen(visibleSnap.startLineGuide[0], VIEWPORT).x}
                      y1={worldToScreen(visibleSnap.startLineGuide[0], VIEWPORT).y}
                      x2={worldToScreen(visibleSnap.startLineGuide[1], VIEWPORT).x}
                      y2={worldToScreen(visibleSnap.startLineGuide[1], VIEWPORT).y}
                    />
                  )}
                  {visibleSnap.gapGuide && (
                    <g className={styles.gapGuide}>
                      {[visibleSnap.gapGuide.first, visibleSnap.gapGuide.second].map(
                        ([start, end], index) => {
                          const a = worldToScreen(start, VIEWPORT);
                          const b = worldToScreen(end, VIEWPORT);
                          return (
                            <g key={index}>
                              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                              {Math.hypot(b.x - a.x, b.y - a.y) >= 42 && (
                                <text
                                  x={(a.x + b.x) / 2}
                                  y={(a.y + b.y) / 2 - 5}
                                  textAnchor="middle"
                                >
                                  {Number(visibleSnap.gapGuide!.meters.toFixed(2))}m
                                </text>
                              )}
                            </g>
                          );
                        },
                      )}
                    </g>
                  )}
                </g>
              )}
              {selectedObjects.map((object) => {
                const origin = worldToScreen({ x: object.x, y: object.y }, VIEWPORT);
                const width = object.width * VIEWPORT.scale;
                const height = object.height * VIEWPORT.scale;
                return (
                  <rect
                    key={object.id}
                    x={origin.x}
                    y={origin.y}
                    width={width}
                    height={height}
                    transform={`rotate(${object.rotation} ${origin.x + width / 2} ${origin.y + height / 2})`}
                    fill="none"
                    stroke="#526fe1"
                    strokeWidth="2"
                    strokeDasharray="5 4"
                    pointerEvents="none"
                  />
                );
              })}
              {selected && (
                <g pointerEvents="none">
                  <line
                    x1={selectedTop!.x}
                    y1={selectedTop!.y}
                    x2={objectRotationHandlePoint(selected, VIEWPORT).x}
                    y2={objectRotationHandlePoint(selected, VIEWPORT).y}
                    stroke="#526fe1"
                    strokeWidth="2"
                  />
                  <circle
                    cx={objectRotationHandlePoint(selected, VIEWPORT).x}
                    cy={objectRotationHandlePoint(selected, VIEWPORT).y}
                    r="7"
                    fill="#fff"
                    stroke="#526fe1"
                    strokeWidth="2"
                  />
                  <circle
                    cx={objectResizeHandlePoint(selected, VIEWPORT).x}
                    cy={objectResizeHandlePoint(selected, VIEWPORT).y}
                    r="7"
                    fill="#fff"
                    stroke="#526fe1"
                    strokeWidth="2"
                  />
                </g>
              )}
            </svg>
            <p>
              {objects.length}개 배치됨 ·{' '}
              {activeItem ? 'Shift+빈 곳 드래그로 영역 선택' : '빈 곳 드래그로 영역 선택'} ·{' '}
              {snapDescription(dragSnap ?? previewSnap)}
            </p>
          </div>
          <aside className={styles.properties} aria-label="세트 물품 편집">
            <h3>{selectedIds.length > 1 ? `물품 ${selectedIds.length}개 선택` : '선택한 물품'}</h3>
            {selected ? (
              <>
                <strong>{selected.name}</strong>
                <label>
                  X 좌표 (m)
                  <NumericTextInput
                    key={`${selected.id}-x`}
                    value={selected.x}
                    onCommit={(x) => updateSelected({ x })}
                  />
                </label>
                <label>
                  Y 좌표 (m)
                  <NumericTextInput
                    key={`${selected.id}-y`}
                    value={selected.y}
                    onCommit={(y) => updateSelected({ y })}
                  />
                </label>
                <label>
                  가로 (m)
                  <NumericTextInput
                    key={`${selected.id}-width`}
                    min={0.1}
                    max={20}
                    value={selected.width}
                    onCommit={(width) => updateSelected({ width })}
                  />
                </label>
                <label>
                  세로 (m)
                  <NumericTextInput
                    key={`${selected.id}-height`}
                    min={0.1}
                    max={20}
                    value={selected.height}
                    onCommit={(height) => updateSelected({ height })}
                  />
                </label>
                <label>
                  회전 (°)
                  <NumericTextInput
                    key={`${selected.id}-rotation`}
                    value={selected.rotation}
                    onCommit={(rotation) =>
                      updateSelected({
                        rotation: normalizeObjectRotation(snapRightAngle(rotation)),
                      })
                    }
                  />
                </label>
                <label>
                  모양
                  <select
                    value={selected.shape}
                    onChange={(event) =>
                      updateSelected({
                        shape: event.target.value as LayoutObject['shape'],
                      })
                    }
                  >
                    {OBJECT_SHAPES.map(({ id, label }) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  색상
                  <input
                    type="color"
                    value={selected.color}
                    onChange={(event) => updateSelected({ color: event.target.value })}
                  />
                </label>
              </>
            ) : sameTypeSelection ? (
              <>
                <strong>
                  {selectedObjects[0].name} · {selectedObjects.length}개
                </strong>
                <p>입력한 값이 선택한 물품 모두에 적용됩니다. 위치는 이동량만큼 함께 바뀝니다.</p>
                <label>
                  X 이동 (m)
                  <NumericTextInput
                    value={0}
                    onCommit={(distance) =>
                      updateSelectedGroup((object) => ({
                        ...object,
                        x: roundMeters(object.x + distance),
                      }))
                    }
                  />
                </label>
                <label>
                  Y 이동 (m)
                  <NumericTextInput
                    value={0}
                    onCommit={(distance) =>
                      updateSelectedGroup((object) => ({
                        ...object,
                        y: roundMeters(object.y + distance),
                      }))
                    }
                  />
                </label>
                <label>
                  가로 (m)
                  <NumericTextInput
                    value={sharedNumber(selectedObjects, 'width')}
                    placeholder="값 다름"
                    min={MIN_OBJECT_SIZE_METERS}
                    max={MAX_OBJECT_SIZE_METERS}
                    onCommit={(width) => updateSelectedGroup((object) => ({ ...object, width }))}
                  />
                </label>
                <label>
                  세로 (m)
                  <NumericTextInput
                    value={sharedNumber(selectedObjects, 'height')}
                    placeholder="값 다름"
                    min={MIN_OBJECT_SIZE_METERS}
                    max={MAX_OBJECT_SIZE_METERS}
                    onCommit={(height) => updateSelectedGroup((object) => ({ ...object, height }))}
                  />
                </label>
                <label>
                  회전 (°)
                  <NumericTextInput
                    value={sharedNumber(selectedObjects, 'rotation')}
                    placeholder="값 다름"
                    onCommit={(rotation) =>
                      updateSelectedGroup((object) => ({
                        ...object,
                        rotation: normalizeObjectRotation(snapRightAngle(rotation)),
                      }))
                    }
                  />
                </label>
                <label>
                  모양
                  <select
                    value={
                      selectedObjects.every((object) => object.shape === selectedObjects[0].shape)
                        ? selectedObjects[0].shape
                        : ''
                    }
                    onChange={(event) =>
                      updateSelectedGroup((object) => ({
                        ...object,
                        shape: event.target.value as LayoutObject['shape'],
                      }))
                    }
                  >
                    <option value="" disabled>
                      값 다름
                    </option>
                    {OBJECT_SHAPES.map(({ id, label }) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  색상
                  <input
                    type="color"
                    value={selectedObjects[0].color}
                    onChange={(event) =>
                      updateSelectedGroup((object) => ({ ...object, color: event.target.value }))
                    }
                  />
                </label>
                {selectedObjects.some((object) => object.color !== selectedObjects[0].color) && (
                  <p>색상이 서로 다릅니다. 새 색을 선택하면 모두 같은 색으로 바뀝니다.</p>
                )}
              </>
            ) : selectedObjects.length > 1 ? (
              <p>
                서로 다른 종류의 물품을 선택했습니다. 같은 종류만 선택하면 크기와 속성을 함께 수정할
                수 있습니다.
              </p>
            ) : (
              <p>물품을 클릭해 편집하거나 Shift+클릭·빈 곳 드래그로 여러 개를 선택하세요.</p>
            )}
          </aside>
        </div>
        <footer className={styles.footer}>
          <label>
            세트 이름
            <input
              autoFocus
              maxLength={40}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="예: 2인 카페 좌석"
            />
          </label>
          {error && <span role="alert">{error}</span>}
          {!name.trim() && objects.length > 0 && !error && (
            <span className={styles.saveHint}>세트 이름을 입력하면 완료할 수 있습니다.</span>
          )}
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className={styles.saveButton}
            disabled={!name.trim() || objects.length === 0}
            onClick={() => {
              if (!onSave(name, objects))
                setError('세트를 저장할 수 없습니다. 이름과 물품을 확인해 주세요.');
            }}
          >
            세트 완료
          </button>
        </footer>
      </section>
    </div>
  );
}
