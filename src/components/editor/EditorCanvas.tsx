import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import { formatArea, type AreaUnit } from '../../domain/geometry/area';
import { snapScreenPointToGrid } from '../../domain/geometry/gridSnap';
import { validatePolygon } from '../../domain/geometry/polygonValidation';
import {
  polygonArea,
  polygonInteriorPoint,
  screenToWorld,
  worldToScreen,
} from '../../domain/geometry/coordinates';
import { getWallSegments, type WallSegment } from '../../domain/geometry/walls';
import { isNearRoomStart, shouldCloseRoomAt } from '../../features/room/closure';
import { roomEditErrorMessage, translateRoomFromScreenDrag } from '../../features/room/edit';
import { hitTestRoom } from '../../features/room/hitTest';
import { snapRoomPoint } from '../../features/room/snap';
import { useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';
import type { Point, Room, Viewport } from '../../types/layout';
import styles from './EditorCanvas.module.scss';

const MIN_SCALE = 20;
const MAX_SCALE = 400;
const SNAP_LABELS = { grid: '격자에 맞춤', horizontal: '수평 보정', vertical: '수직 보정' };

function WallLengthLabel({ wall, viewport }: { wall: WallSegment; viewport: Viewport }) {
  const start = worldToScreen(wall.start, viewport);
  const end = worldToScreen(wall.end, viewport);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const screenLength = Math.hypot(dx, dy) || 1;

  return (
    <text
      className={styles.wallLength}
      x={(start.x + end.x) / 2 - (dy / screenLength) * 13}
      y={(start.y + end.y) / 2 + (dx / screenLength) * 13}
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {Number(wall.lengthMeters.toFixed(2))}m
    </text>
  );
}

function RoomAreaLabel({
  room,
  viewport,
  areaUnit,
}: {
  room: Room;
  viewport: Viewport;
  areaUnit: AreaUnit;
}) {
  const point = worldToScreen(polygonInteriorPoint(room.vertices), viewport);
  return (
    <text
      className={styles.roomArea}
      x={point.x}
      y={point.y}
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {formatArea(polygonArea(room.vertices), areaUnit)}
    </text>
  );
}

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

export function EditorCanvas({ areaUnit }: { areaUnit: AreaUnit }) {
  const viewport = useEditorStore((state) => state.viewport);
  const setViewport = useEditorStore((state) => state.setViewport);
  const tool = useEditorStore((state) => state.tool);
  const roomDraftVertices = useEditorStore((state) => state.roomDraftVertices);
  const addRoomDraftVertex = useEditorStore((state) => state.addRoomDraftVertex);
  const clearRoomDraft = useEditorStore((state) => state.clearRoomDraft);
  const selectedRoomId = useEditorStore((state) => state.selectedRoomId);
  const selectedWallIndex = useEditorStore((state) => state.selectedWallIndex);
  const roomEditPreview = useEditorStore((state) => state.roomEditPreview);
  const geometryError = useEditorStore((state) => state.geometryError);
  const selectRoom = useEditorStore((state) => state.selectRoom);
  const selectWall = useEditorStore((state) => state.selectWall);
  const setRoomEditPreview = useEditorStore((state) => state.setRoomEditPreview);
  const setGeometryError = useEditorStore((state) => state.setGeometryError);
  const activeFloorId = useEditorStore((state) => state.activeFloorId);
  const floor = useProjectStore((state) => state.floorsById[activeFloorId ?? '']);
  const roomsById = useProjectStore((state) => state.roomsById);
  const createRoom = useProjectStore((state) => state.createRoom);
  const updateRoomVertices = useProjectStore((state) => state.updateRoomVertices);
  const spacePressed = useSpaceKey();
  const drag = useRef<{ pointerId: number; point: Point; viewport: Viewport } | null>(null);
  const roomClick = useRef<{ pointerId: number; point: Point } | null>(null);
  const vertexDrag = useRef<{
    pointerId: number;
    roomId: string;
    vertexIndex: number;
    originalVertices: Point[];
    candidate: Point[] | null;
    valid: boolean;
  } | null>(null);
  const roomDrag = useRef<{
    pointerId: number;
    roomId: string;
    startPoint: Point;
    originalVertices: Point[];
  } | null>(null);
  const [cursorWorld, setCursorWorld] = useState<Point>({ x: 0, y: 0 });
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const [movingVertex, setMovingVertex] = useState(false);
  const [movingRoom, setMovingRoom] = useState(false);
  const [hoveredEditVertex, setHoveredEditVertex] = useState(false);
  const [hoveredRoomInterior, setHoveredRoomInterior] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const rooms = (floor?.roomIds ?? []).map((id) => roomsById[id]).filter((room) => room != null);
  const displayedRooms = rooms.map((room) =>
    roomEditPreview?.roomId === room.id ? { ...room, vertices: roomEditPreview.vertices } : room,
  );
  const selectedRoom = displayedRooms.find((room) => room.id === selectedRoomId);
  const selectedWall =
    selectedRoom && selectedWallIndex !== null
      ? getWallSegments(selectedRoom.vertices, true)[selectedWallIndex]
      : null;
  const screenVertices = roomDraftVertices.map((point) => worldToScreen(point, viewport));
  const draftWalls = getWallSegments(roomDraftVertices, false);
  const nearStart =
    tool === 'room' &&
    !spacePressed &&
    !dragging &&
    hoverPoint !== null &&
    isNearRoomStart(hoverPoint, roomDraftVertices, viewport);
  const closeReady =
    nearStart && hoverPoint !== null && shouldCloseRoomAt(hoverPoint, roomDraftVertices, viewport);
  const roomSnap =
    tool === 'room' && !spacePressed && !dragging && hoverPoint !== null && !nearStart
      ? snapRoomPoint(hoverPoint, roomDraftVertices.at(-1), viewport)
      : null;
  const snapCuePoint = closeReady ? screenVertices[0] : roomSnap?.screen;
  const snapLabel = closeReady
    ? '클릭하여 공간 완성'
    : roomSnap
      ? SNAP_LABELS[roomSnap.kind]
      : null;
  const displayedCursorWorld = closeReady ? roomDraftVertices[0] : (roomSnap?.world ?? cursorWorld);

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
    const panGesture =
      event.button === 1 || (event.button === 0 && (spacePressed || tool === 'pan'));
    if (!panGesture && event.button !== 0) return;
    event.preventDefault();
    if (panGesture) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setHoverPoint(null);
      setHoveredEditVertex(false);
      setHoveredRoomInterior(false);
      drag.current = { pointerId: event.pointerId, point: localPoint(event), viewport };
      setDragging(true);
    } else if (tool === 'room') {
      event.currentTarget.setPointerCapture(event.pointerId);
      roomClick.current = { pointerId: event.pointerId, point: localPoint(event) };
    } else if (tool === 'select') {
      const hit = hitTestRoom(
        rooms,
        localPoint(event),
        viewport,
        event.pointerType === 'touch' ? 18 : 10,
      );
      if (!hit) {
        selectRoom(null);
        return;
      }
      if (hit.kind === 'wall') selectWall(hit.roomId, hit.index);
      else selectRoom(hit.roomId);
      if (hit.kind === 'vertex') {
        const room = roomsById[hit.roomId];
        if (!room) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        vertexDrag.current = {
          pointerId: event.pointerId,
          roomId: hit.roomId,
          vertexIndex: hit.index,
          originalVertices: room.vertices,
          candidate: null,
          valid: true,
        };
        setMovingVertex(true);
      } else if (hit.kind === 'interior') {
        const room = roomsById[hit.roomId];
        if (!room) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        roomDrag.current = {
          pointerId: event.pointerId,
          roomId: hit.roomId,
          startPoint: localPoint(event),
          originalVertices: room.vertices,
        };
        setMovingRoom(true);
      }
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const point = localPoint(event);
    const currentDrag = drag.current;
    const currentVertexDrag = vertexDrag.current;
    const currentRoomDrag = roomDrag.current;
    if (currentVertexDrag?.pointerId === event.pointerId) {
      const nextPoint =
        snapScreenPointToGrid(point, viewport)?.world ?? screenToWorld(point, viewport);
      const candidate = currentVertexDrag.originalVertices.map((vertex, index) =>
        index === currentVertexDrag.vertexIndex ? nextPoint : vertex,
      );
      const error = validatePolygon(candidate);
      currentVertexDrag.valid = error === null;
      currentVertexDrag.candidate = error ? null : candidate;
      setRoomEditPreview(error ? null : { roomId: currentVertexDrag.roomId, vertices: candidate });
      setGeometryError(error);
    } else if (currentRoomDrag?.pointerId === event.pointerId) {
      const dx = point.x - currentRoomDrag.startPoint.x;
      const dy = point.y - currentRoomDrag.startPoint.y;
      const moved = Math.hypot(dx, dy) > 4;
      const candidate = moved
        ? translateRoomFromScreenDrag(
            currentRoomDrag.originalVertices,
            currentRoomDrag.startPoint,
            point,
            viewport,
          )
        : null;
      setRoomEditPreview(
        candidate ? { roomId: currentRoomDrag.roomId, vertices: candidate } : null,
      );
    } else if (currentDrag?.pointerId === event.pointerId) {
      setViewport({
        ...currentDrag.viewport,
        x: currentDrag.viewport.x + point.x - currentDrag.point.x,
        y: currentDrag.viewport.y + point.y - currentDrag.point.y,
      });
    } else {
      setCursorWorld(screenToWorld(point, viewport));
      setHoverPoint(event.pointerType === 'touch' ? null : point);
      const hoveredHit = tool === 'select' ? hitTestRoom(rooms, point, viewport) : null;
      setHoveredEditVertex(hoveredHit?.kind === 'vertex');
      setHoveredRoomInterior(hoveredHit?.kind === 'interior');
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (roomDrag.current?.pointerId === event.pointerId) {
      const edit = roomDrag.current;
      roomDrag.current = null;
      setMovingRoom(false);
      setRoomEditPreview(null);
      const point = localPoint(event);
      if (Math.hypot(point.x - edit.startPoint.x, point.y - edit.startPoint.y) > 4) {
        const candidate = translateRoomFromScreenDrag(
          edit.originalVertices,
          edit.startPoint,
          point,
          viewport,
        );
        setGeometryError(updateRoomVertices(edit.roomId, candidate));
      }
      return;
    }
    if (vertexDrag.current?.pointerId === event.pointerId) {
      const edit = vertexDrag.current;
      vertexDrag.current = null;
      setMovingVertex(false);
      setRoomEditPreview(null);
      if (edit.valid && edit.candidate) {
        setGeometryError(updateRoomVertices(edit.roomId, edit.candidate));
      }
      return;
    }
    if (drag.current?.pointerId === event.pointerId) {
      finishInteraction();
      return;
    }
    const click = roomClick.current;
    roomClick.current = null;
    if (click?.pointerId !== event.pointerId || tool !== 'room') return;
    const point = localPoint(event);
    if (Math.hypot(point.x - click.point.x, point.y - click.point.y) > 4) return;
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x > event.currentTarget.clientWidth ||
      point.y > event.currentTarget.clientHeight
    )
      return;
    if (isNearRoomStart(point, roomDraftVertices, viewport)) {
      const validationError = validatePolygon(roomDraftVertices);
      if (validationError) {
        setRoomError(roomEditErrorMessage(validationError));
        return;
      }
      if (!shouldCloseRoomAt(point, roomDraftVertices, viewport)) {
        setRoomError(
          roomDraftVertices.length < 3
            ? '공간을 닫으려면 서로 다른 점 세 개 이상이 필요합니다.'
            : '면적이 없는 도형은 공간으로 만들 수 없습니다.',
        );
        return;
      }
      if (!activeFloorId || !createRoom(activeFloorId, roomDraftVertices)) {
        setRoomError('공간을 만들 수 없습니다. 점 위치를 확인해 주세요.');
        return;
      }
      clearRoomDraft();
      setHoverPoint(null);
      setRoomError(null);
      return;
    }
    addRoomDraftVertex(
      snapRoomPoint(point, roomDraftVertices.at(-1), viewport)?.world ??
        screenToWorld(point, viewport),
    );
    setRoomError(null);
  }

  function finishInteraction() {
    drag.current = null;
    roomClick.current = null;
    if (vertexDrag.current) {
      vertexDrag.current = null;
      setRoomEditPreview(null);
      setMovingVertex(false);
    }
    if (roomDrag.current) {
      roomDrag.current = null;
      setRoomEditPreview(null);
      setMovingRoom(false);
    }
    setDragging(false);
  }

  const cancelRoomDraft = useCallback(() => {
    roomClick.current = null;
    clearRoomDraft();
    setHoverPoint(null);
    setRoomError(null);
  }, [clearRoomDraft]);

  useEffect(() => {
    if (roomDraftVertices.length === 0 && !movingVertex && !movingRoom) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (vertexDrag.current || roomDrag.current) {
        vertexDrag.current = null;
        roomDrag.current = null;
        setRoomEditPreview(null);
        setMovingVertex(false);
        setMovingRoom(false);
        setGeometryError(null);
      } else {
        cancelRoomDraft();
      }
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [
    cancelRoomDraft,
    movingVertex,
    movingRoom,
    roomDraftVertices.length,
    setGeometryError,
    setRoomEditPreview,
  ]);

  return (
    <div className={styles.wrapper}>
      <div
        aria-label="도면 편집 영역"
        className={`${styles.canvas} ${dragging ? styles.dragging : ''} ${spacePressed || tool === 'pan' ? styles.pan : ''} ${snapCuePoint ? styles.snapReady : ''} ${tool === 'select' && !spacePressed ? styles.select : ''} ${movingVertex || (!spacePressed && tool === 'select' && hoveredEditVertex) ? styles.vertexDragging : ''} ${movingRoom ? styles.roomDragging : !movingVertex && !spacePressed && tool === 'select' && hoveredRoomInterior ? styles.roomReady : ''}`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          setHoverPoint(null);
          setHoveredEditVertex(false);
          setHoveredRoomInterior(false);
        }}
        onPointerUp={handlePointerUp}
        onPointerCancel={finishInteraction}
        onLostPointerCapture={finishInteraction}
        style={{
          backgroundSize: `${viewport.scale}px ${viewport.scale}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        }}
      >
        <div className={styles.origin} style={{ left: viewport.x, top: viewport.y }} />
        <svg className={styles.roomDraft} aria-hidden="true">
          {displayedRooms.map((room) => (
            <g key={room.id}>
              <polygon
                className={`${styles.completedRoom} ${room.id === selectedRoomId ? styles.selectedRoom : ''}`}
                points={room.vertices
                  .map((vertex) => worldToScreen(vertex, viewport))
                  .map((vertex) => `${vertex.x},${vertex.y}`)
                  .join(' ')}
              />
              <RoomAreaLabel room={room} viewport={viewport} areaUnit={areaUnit} />
              {getWallSegments(room.vertices, true).map((wall, index) => (
                <WallLengthLabel key={index} wall={wall} viewport={viewport} />
              ))}
            </g>
          ))}
          {tool === 'select' && selectedRoom && (
            <g>
              {selectedWall && (
                <line
                  className={styles.selectedWall}
                  x1={worldToScreen(selectedWall.start, viewport).x}
                  y1={worldToScreen(selectedWall.start, viewport).y}
                  x2={worldToScreen(selectedWall.end, viewport).x}
                  y2={worldToScreen(selectedWall.end, viewport).y}
                />
              )}
              {selectedRoom.vertices.map((vertex, index) => {
                const point = worldToScreen(vertex, viewport);
                return (
                  <circle
                    key={index}
                    className={styles.editVertex}
                    cx={point.x}
                    cy={point.y}
                    r={7}
                  />
                );
              })}
            </g>
          )}
          {draftWalls.map((wall, index) => {
            const start = worldToScreen(wall.start, viewport);
            const end = worldToScreen(wall.end, viewport);
            return <line key={index} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />;
          })}
          {roomSnap && screenVertices.length > 0 && (
            <line
              className={styles.snapPreviewWall}
              x1={screenVertices.at(-1)!.x}
              y1={screenVertices.at(-1)!.y}
              x2={roomSnap.screen.x}
              y2={roomSnap.screen.y}
            />
          )}
          {closeReady && (
            <line
              className={styles.closingWall}
              x1={screenVertices.at(-1)!.x}
              y1={screenVertices.at(-1)!.y}
              x2={screenVertices[0].x}
              y2={screenVertices[0].y}
            />
          )}
          {screenVertices.map((point, index) => (
            <circle
              key={index}
              className={
                index === 0 && roomDraftVertices.length >= 3 ? styles.closePoint : undefined
              }
              cx={point.x}
              cy={point.y}
              r={index === 0 && roomDraftVertices.length >= 3 ? 7 : 5}
            />
          ))}
          {draftWalls.map((wall, index) => (
            <WallLengthLabel key={index} wall={wall} viewport={viewport} />
          ))}
        </svg>
        {snapCuePoint && (
          <div
            className={`${styles.snapCue} ${roomSnap ? styles.guideSnapCue : ''}`}
            style={{ left: snapCuePoint.x, top: snapCuePoint.y }}
            aria-hidden="true"
          >
            <span className={styles.snapCursor} />
            <span className={styles.snapLabel}>{snapLabel}</span>
          </div>
        )}
        {roomDraftVertices.length === 0 && rooms.length === 0 && (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>◇</span>
            <strong>
              {tool === 'room' ? '공간의 첫 점을 클릭하세요' : '새 도면을 시작할 준비가 됐어요'}
            </strong>
            <span>
              {tool === 'room'
                ? '세 점 이상 찍은 뒤 시작점을 클릭하면 공간이 완성됩니다.'
                : '휠로 확대·축소하고, Space + 드래그로 이동해 보세요.'}
            </span>
          </div>
        )}
      </div>
      {roomDraftVertices.length > 0 && (
        <button className={styles.cancelDraft} type="button" onClick={cancelRoomDraft}>
          그리기 취소 <span>Esc</span>
        </button>
      )}
      <div className={styles.status}>
        <span>1칸 = 1m</span>
        <span>
          좌표 {displayedCursorWorld.x.toFixed(1)}m, {displayedCursorWorld.y.toFixed(1)}m
        </span>
        <span>{Math.round((viewport.scale / 80) * 100)}%</span>
        {roomDraftVertices.length > 0 && (
          <span>
            그리는 중: 점 {roomDraftVertices.length}개 · 벽 {draftWalls.length}개
          </span>
        )}
        {roomError && <span className={styles.error}>{roomError}</span>}
        {geometryError && (
          <span className={styles.error}>{roomEditErrorMessage(geometryError)}</span>
        )}
      </div>
    </div>
  );
}
