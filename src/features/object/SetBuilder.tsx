import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { screenToWorld, worldToScreen } from '../../domain/geometry/coordinates';
import { snapRightAngle } from '../../domain/geometry/angles';
import { LayoutObjectShape } from '../../components/editor/LayoutObjectShape';
import {
  DEFAULT_OBJECT_ARRAY,
  isValidObjectArray,
  objectArrayCenters,
  objectArrayFootprint,
  type ObjectArrayOptions,
} from './array';
import { layoutObjectFromPaletteItem, OBJECT_SHAPES } from './catalog';
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
import type { LayoutObject, PaletteItem, Point, Viewport } from '../../types/layout';
import styles from './SetBuilder.module.scss';

const BOARD_WIDTH = 600;
const BOARD_HEIGHT = 420;
const VIEWPORT: Viewport = { x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2, scale: 70 };

function roundMeters(value: number): number {
  return Math.round(value * 1000) / 1000;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [dragSnap, setDragSnap] = useState<ObjectPlacementSnap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{
    pointerId: number;
    objectId: string;
    mode: 'move' | 'resize' | 'rotate';
    start: Point;
    origin: Point;
    original: LayoutObject;
    before: LayoutObject[];
  } | null>(null);
  const selected = objects.find((object) => object.id === selectedId);
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
    activeItem && hoverPoint && !drag.current
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
      event.preventDefault();
      event.stopPropagation();
      setSelectedId(null);
      setActiveItemId(null);
      setHoverPoint(null);
      setDragSnap(null);
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
    if (!selectedId) return;
    setHistory((current) =>
      commitBuilderEdit(
        current,
        current.present.map((object) =>
          object.id === selectedId ? { ...object, ...patch } : object,
        ),
      ),
    );
  }

  function removeSelected() {
    if (!selectedId) return;
    setHistory((current) =>
      commitBuilderEdit(current, current.present.filter((object) => object.id !== selectedId)),
    );
    setSelectedId(null);
  }

  function undoEdit() {
    setHistory(undoBuilderEdit);
    setSelectedId(null);
    setDragSnap(null);
  }

  function redoEdit() {
    setHistory(redoBuilderEdit);
    setSelectedId(null);
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
    if (selected) {
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
          origin: { x: selected.x, y: selected.y },
          original: selected,
          before: objects,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        setHoverPoint(null);
        return;
      }
    }
    const hit = hitTestLayoutObject(objects, point, VIEWPORT);
    if (hit) {
      setSelectedId(hit.id);
      setHoverPoint(null);
      drag.current = {
        pointerId: event.pointerId,
        objectId: hit.id,
        mode: 'move',
        start: point,
        origin: { x: hit.x, y: hit.y },
        original: hit,
        before: objects,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (!activeItem) {
      setSelectedId(null);
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
    setSelectedId(created.at(-1)!.id);
    setHoverPoint(point);
    setError(null);
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const currentDrag = drag.current;
    const point = boardPoint(event);
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
    const moving = objects.find((object) => object.id === currentDrag.objectId);
    if (!moving) return;
    const rawCenter = {
      x: currentDrag.origin.x + delta.x + moving.width / 2,
      y: currentDrag.origin.y + delta.y + moving.height / 2,
    };
    const snap = snapObjectPlacement(
      worldToScreen(rawCenter, VIEWPORT),
      VIEWPORT,
      objects.filter((object) => object.id !== moving.id),
      moving,
    );
    setDragSnap(snap);
    setHistory((current) =>
      previewBuilderEdit(
        current,
        current.present.map((object) =>
          object.id === currentDrag.objectId
            ? {
                ...object,
                x: roundMeters(snap.center.x - object.width / 2),
                y: roundMeters(snap.center.y - object.height / 2),
              }
            : object,
        ),
      ),
    );
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
          const editingText = target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            (target instanceof HTMLElement && target.isContentEditable);
          if (editingText) return;
          const command = (event.ctrlKey || event.metaKey) && !event.altKey;
          const key = event.key.toLowerCase();
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
          if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
            event.preventDefault();
            removeSelected();
          }
        }}
      >
        <header className={styles.header}>
          <div>
            <h2>내 세트 만들기</h2>
            <p>물품을 골라 배치하세요. 자동 정렬과 간격 보정이 적용됩니다. 작업판에서 Backspace/Delete로 삭제, Ctrl+Z로 되돌리기, Esc로 선택 해제가 가능합니다.</p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" disabled={history.past.length === 0} onClick={undoEdit}>되돌리기</button>
            <button type="button" disabled={history.future.length === 0} onClick={redoEdit}>다시 실행</button>
            <button type="button" onClick={onClose} aria-label="세트 만들기 닫기">×</button>
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
                onClick={() => setActiveItemId(item.id)}
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
                <input
                  type="number"
                  min="1"
                  max={Math.floor(100 / arrayOptions.rows)}
                  value={arrayOptions.columns}
                  onChange={(event) => updateArray({ columns: Number(event.target.value) })}
                />
              </label>
              <label>
                세로 개수
                <input
                  type="number"
                  min="1"
                  max={Math.floor(100 / arrayOptions.columns)}
                  value={arrayOptions.rows}
                  onChange={(event) => updateArray({ rows: Number(event.target.value) })}
                />
              </label>
              <label>
                가로 간격 (m)
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.1"
                  value={arrayOptions.gapX}
                  onChange={(event) => updateArray({ gapX: Number(event.target.value) })}
                />
              </label>
              <label>
                세로 간격 (m)
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.1"
                  value={arrayOptions.gapY}
                  onChange={(event) => updateArray({ gapY: Number(event.target.value) })}
                />
              </label>
            </fieldset>
          </aside>
          <div className={styles.boardArea}>
            <svg
              tabIndex={0}
              className={styles.board}
              viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
              role="img"
              aria-label={`세트 작업판, 배치한 물품 ${objects.length}개`}
              onContextMenu={(event) => {
                event.preventDefault();
                setSelectedId(null);
                setActiveItemId(null);
                setHoverPoint(null);
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={() => {
                const before = drag.current?.before;
                if (before) setHistory((current) => finishBuilderGesture(current, before));
                drag.current = null;
                setDragSnap(null);
              }}
              onPointerCancel={() => {
                const before = drag.current?.before;
                if (before) setHistory((current) => previewBuilderEdit(current, before));
                drag.current = null;
                setDragSnap(null);
              }}
              onLostPointerCapture={() => {
                const before = drag.current?.before;
                if (before) setHistory((current) => previewBuilderEdit(current, before));
                drag.current = null;
                setDragSnap(null);
              }}
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
              {selected &&
                (() => {
                  const origin = worldToScreen({ x: selected.x, y: selected.y }, VIEWPORT);
                  const width = selected.width * VIEWPORT.scale;
                  const height = selected.height * VIEWPORT.scale;
                  return (
                    <rect
                      x={origin.x}
                      y={origin.y}
                      width={width}
                      height={height}
                      transform={`rotate(${selected.rotation} ${origin.x + width / 2} ${origin.y + height / 2})`}
                      fill="none"
                      stroke="#526fe1"
                      strokeWidth="2"
                      strokeDasharray="5 4"
                      pointerEvents="none"
                    />
                  );
                })()}
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
              {objects.length}개 배치됨 · {snapDescription(dragSnap ?? previewSnap)} · 물품을
              드래그해 이동
            </p>
          </div>
          <aside className={styles.properties} aria-label="세트 물품 편집">
            <h3>선택한 물품</h3>
            {selected ? (
              <>
                <strong>{selected.name}</strong>
                <label>
                  X 좌표 (m)
                  <input
                    type="number"
                    step="0.1"
                    value={selected.x}
                    onChange={(event) => {
                      const x = Number(event.target.value);
                      if (Number.isFinite(x)) updateSelected({ x });
                    }}
                  />
                </label>
                <label>
                  Y 좌표 (m)
                  <input
                    type="number"
                    step="0.1"
                    value={selected.y}
                    onChange={(event) => {
                      const y = Number(event.target.value);
                      if (Number.isFinite(y)) updateSelected({ y });
                    }}
                  />
                </label>
                <label>
                  가로 (m)
                  <input
                    type="number"
                    min="0.1"
                    max="20"
                    step="0.1"
                    value={selected.width}
                    onChange={(event) => {
                      const width = Number(event.target.value);
                      if (width >= 0.1 && width <= 20) updateSelected({ width });
                    }}
                  />
                </label>
                <label>
                  세로 (m)
                  <input
                    type="number"
                    min="0.1"
                    max="20"
                    step="0.1"
                    value={selected.height}
                    onChange={(event) => {
                      const height = Number(event.target.value);
                      if (height >= 0.1 && height <= 20) updateSelected({ height });
                    }}
                  />
                </label>
                <label>
                  회전 (°)
                  <input
                    type="number"
                    step="15"
                    value={selected.rotation}
                    onChange={(event) => {
                      const rotation = Number(event.target.value);
                      if (Number.isFinite(rotation)) updateSelected({ rotation });
                    }}
                    onBlur={() =>
                      updateSelected({
                        rotation: normalizeObjectRotation(snapRightAngle(selected.rotation)),
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
                <button
                  type="button"
                  onClick={() => {
                    if (objects.length >= 100) return;
                    const duplicate = {
                      ...selected,
                      id: crypto.randomUUID(),
                      x: roundMeters(selected.x + 0.2),
                      y: roundMeters(selected.y + 0.2),
                    };
                    setHistory((current) => commitBuilderEdit(current, [...current.present, duplicate]));
                    setSelectedId(duplicate.id);
                  }}
                  disabled={objects.length >= 100}
                >
                  선택한 물품 복제
                </button>
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={removeSelected}
                >
                  선택한 물품 삭제
                </button>
              </>
            ) : (
              <p>작업판에서 물품을 선택하면 크기·회전·색상을 바꿀 수 있습니다.</p>
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
