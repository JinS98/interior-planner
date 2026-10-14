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
import { canAddDivisionBend, splitPolygon } from '../../domain/geometry/polygonSplit';
import {
  polygonArea,
  polygonInteriorPoint,
  screenToWorld,
  worldToScreen,
} from '../../domain/geometry/coordinates';
import { getWallSegments, type WallSegment } from '../../domain/geometry/walls';
import { isNearRoomStart, shouldCloseRoomAt } from '../../features/room/closure';
import { findRoomBoundarySnap } from '../../features/room/division';
import { roomEditErrorMessage, translateRoomFromScreenDrag } from '../../features/room/edit';
import { hitTestRoom } from '../../features/room/hitTest';
import { snapRoomPoint } from '../../features/room/snap';
import { layoutObjectFromPaletteItem } from '../../features/object/catalog';
import {
  copySelectedObjects,
  deleteSelectedObjects,
  pasteCopiedObjects,
} from '../../features/object/clipboard';
import { resizeObjectFromScreenDrag, rotateObjectFromScreenDrag } from '../../features/object/edit';
import {
  hitTestLayoutObject,
  isNearObjectResizeHandle,
  isNearObjectRotationHandle,
} from '../../features/object/hitTest';
import { snapObjectPlacement } from '../../features/object/snap';
import { snapObjectMove, type ObjectMoveSnap } from '../../features/object/moveSnap';
import { objectsInSelectionRect, selectionRectBetween } from '../../features/object/selection';
import { redoEditorCommand, undoEditorCommand } from '../../features/history/actions';
import {
  isSpaceActivationTarget,
  isTypingTarget,
  resolveEditorShortcut,
} from '../../features/editor/shortcuts';
import { useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';
import type { LayoutObject, Point, Room, Viewport } from '../../types/layout';
import { LayoutObjectShape } from './LayoutObjectShape';
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

export function EditorCanvas({ areaUnit }: { areaUnit: AreaUnit }) {
  const viewport = useEditorStore((state) => state.viewport);
  const setViewport = useEditorStore((state) => state.setViewport);
  const tool = useEditorStore((state) => state.tool);
  const setTool = useEditorStore((state) => state.setTool);
  const selectedPaletteItemId = useEditorStore((state) => state.selectedPaletteItemId);
  const clearPaletteItem = useEditorStore((state) => state.clearPaletteItem);
  const objectPlacement = useEditorStore((state) => state.objectPlacement);
  const selectedObjectIds = useEditorStore((state) => state.selectedObjectIds);
  const selectedObjectId = selectedObjectIds.length === 1 ? selectedObjectIds[0] : null;
  const objectEditPreview = useEditorStore((state) => state.objectEditPreview);
  const objectMovePreviewById = useEditorStore((state) => state.objectMovePreviewById);
  const selectObject = useEditorStore((state) => state.selectObject);
  const selectObjects = useEditorStore((state) => state.selectObjects);
  const toggleObjectSelection = useEditorStore((state) => state.toggleObjectSelection);
  const setObjectEditPreview = useEditorStore((state) => state.setObjectEditPreview);
  const setObjectMovePreview = useEditorStore((state) => state.setObjectMovePreview);
  const roomDraftVertices = useEditorStore((state) => state.roomDraftVertices);
  const divisionDraft = useEditorStore((state) => state.divisionDraft);
  const addRoomDraftVertex = useEditorStore((state) => state.addRoomDraftVertex);
  const undoRoomDraftVertex = useEditorStore((state) => state.undoRoomDraftVertex);
  const clearRoomDraft = useEditorStore((state) => state.clearRoomDraft);
  const setDivisionDraft = useEditorStore((state) => state.setDivisionDraft);
  const undoDivisionDraftPoint = useEditorStore((state) => state.undoDivisionDraftPoint);
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
  const objectsById = useProjectStore((state) => state.objectsById);
  const selectedPaletteItem = useProjectStore(
    (state) => state.paletteItemsById[selectedPaletteItemId ?? ''],
  );
  const createRoom = useProjectStore((state) => state.createRoom);
  const createLayoutObject = useProjectStore((state) => state.createLayoutObject);
  const updateLayoutObject = useProjectStore((state) => state.updateLayoutObject);
  const moveLayoutObjects = useProjectStore((state) => state.moveLayoutObjects);
  const splitRoom = useProjectStore((state) => state.splitRoom);
  const updateRoomVertices = useProjectStore((state) => state.updateRoomVertices);
  const [spacePressed, setSpacePressed] = useState(false);
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
  const objectResize = useRef<{
    pointerId: number;
    startPoint: Point;
    original: LayoutObject;
  } | null>(null);
  const objectMove = useRef<{
    pointerId: number;
    startPoint: Point;
    originals: LayoutObject[];
    stationary: LayoutObject[];
    primaryId: string;
    viewport: Viewport;
  } | null>(null);
  const marquee = useRef<{
    pointerId: number;
    start: Point;
    current: Point;
    additive: boolean;
    baseIds: string[];
  } | null>(null);
  const objectRotate = useRef<{
    pointerId: number;
    startPoint: Point;
    original: LayoutObject;
  } | null>(null);
  const [cursorWorld, setCursorWorld] = useState<Point>({ x: 0, y: 0 });
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const [movingVertex, setMovingVertex] = useState(false);
  const [movingRoom, setMovingRoom] = useState(false);
  const [resizingObject, setResizingObject] = useState(false);
  const [movingObject, setMovingObject] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<{ start: Point; current: Point } | null>(null);
  const [moveSnap, setMoveSnap] = useState<ObjectMoveSnap | null>(null);
  const [rotatingObject, setRotatingObject] = useState(false);
  const [hoveredObject, setHoveredObject] = useState(false);
  const [hoveredObjectHandle, setHoveredObjectHandle] = useState(false);
  const [hoveredObjectRotateHandle, setHoveredObjectRotateHandle] = useState(false);
  const [hoveredEditVertex, setHoveredEditVertex] = useState(false);
  const [hoveredRoomInterior, setHoveredRoomInterior] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const rooms = (floor?.roomIds ?? []).map((id) => roomsById[id]).filter((room) => room != null);
  const objects = (floor?.objectIds ?? [])
    .map((id) => objectsById[id])
    .filter((object) => object != null);
  const displayedObjects = objects.map(
    (object) =>
      objectMovePreviewById?.[object.id] ??
      (objectEditPreview?.id === object.id ? objectEditPreview : object),
  );
  const selectedObject = displayedObjects.find((object) => object.id === selectedObjectId);
  const selectedObjectOrigin = selectedObject
    ? worldToScreen({ x: selectedObject.x, y: selectedObject.y }, viewport)
    : null;
  const selectedObjectCenter = selectedObject
    ? worldToScreen(
        {
          x: selectedObject.x + selectedObject.width / 2,
          y: selectedObject.y + selectedObject.height / 2,
        },
        viewport,
      )
    : null;
  const marqueeBounds = marqueeRect
    ? selectionRectBetween(marqueeRect.start, marqueeRect.current)
    : null;
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
  const divisionRoom = divisionDraft && roomsById[divisionDraft.roomId];
  const divisionSnap =
    tool === 'divide' && !spacePressed && !dragging && hoverPoint !== null
      ? findRoomBoundarySnap(
          divisionRoom ? [divisionRoom] : rooms,
          hoverPoint,
          viewport,
          divisionDraft?.roomId ?? selectedRoomId,
        )
      : null;
  const lastDivisionPoint = divisionDraft?.points.at(-1);
  const divisionInteriorSnap =
    tool === 'divide' && divisionDraft && !divisionSnap && hoverPoint !== null && !spacePressed
      ? snapRoomPoint(hoverPoint, lastDivisionPoint, viewport)
      : null;
  const divisionHoverWorld =
    divisionDraft && hoverPoint !== null
      ? (divisionSnap?.world ?? divisionInteriorSnap?.world ?? screenToWorld(hoverPoint, viewport))
      : null;
  const divisionHoverScreen =
    hoverPoint === null
      ? null
      : (divisionSnap?.screen ?? divisionInteriorSnap?.screen ?? hoverPoint);
  const divisionScreenPoints =
    divisionDraft?.points.map((point) => worldToScreen(point, viewport)) ?? [];
  const divisionReady =
    divisionDraft && divisionRoom && divisionSnap
      ? splitPolygon(divisionRoom.vertices, [...divisionDraft.points, divisionSnap.world]) !== null
      : false;
  const divisionBendReady =
    divisionDraft && divisionRoom && divisionHoverWorld && !divisionSnap
      ? canAddDivisionBend(divisionRoom.vertices, divisionDraft.points, divisionHoverWorld)
      : false;
  const snapCuePoint = closeReady
    ? screenVertices[0]
    : (roomSnap?.screen ?? divisionSnap?.screen ?? divisionInteriorSnap?.screen);
  const snapLabel = closeReady
    ? '클릭하여 공간 완성'
    : roomSnap
      ? SNAP_LABELS[roomSnap.kind]
      : divisionSnap
        ? divisionDraft
          ? divisionReady
            ? '클릭하여 공간 분할'
            : '분할할 수 없는 경로입니다'
          : '분할 시작점'
        : divisionInteriorSnap && divisionDraft
          ? divisionBendReady
            ? '클릭하여 꺾임점 추가'
            : '방 내부의 다른 점을 선택하세요'
          : null;
  const displayedCursorWorld = closeReady
    ? roomDraftVertices[0]
    : (roomSnap?.world ?? divisionSnap?.world ?? divisionInteriorSnap?.world ?? cursorWorld);
  const placementSnap =
    tool === 'object' && selectedPaletteItem && !spacePressed && !dragging && hoverPoint !== null
      ? snapObjectPlacement(hoverPoint, viewport, objects, objectPlacement)
      : null;
  const placementCenter = placementSnap?.center ?? null;
  const placementScreen = placementCenter ? worldToScreen(placementCenter, viewport) : null;
  const objectPreview =
    placementCenter && selectedPaletteItem
      ? layoutObjectFromPaletteItem(
          activeFloorId ?? '',
          selectedPaletteItem,
          placementCenter,
          'preview',
          objectPlacement,
        )
      : null;
  const placementHint = placementSnap?.gapGuide
    ? `같은 간격 ${Number(placementSnap.gapGuide.meters.toFixed(2))}m`
    : placementSnap?.horizontalReference && placementSnap.verticalReference
      ? '가로·세로 정렬'
      : placementSnap?.horizontalReference
        ? '가로 정렬'
        : placementSnap?.verticalReference
          ? '세로 정렬'
          : placementSnap?.grid
            ? '격자에 맞춤'
            : '클릭하여 배치';

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

  function beginMarquee(event: PointerEvent<HTMLDivElement>, start: Point, additive: boolean) {
    event.currentTarget.setPointerCapture(event.pointerId);
    marquee.current = {
      pointerId: event.pointerId,
      start,
      current: start,
      additive,
      baseIds: additive ? selectedObjectIds : [],
    };
    setMarqueeRect({ start, current: start });
    if (additive) selectObjects(selectedObjectIds);
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
    } else if (tool === 'room' || tool === 'divide' || (tool === 'object' && selectedPaletteItem)) {
      event.currentTarget.setPointerCapture(event.pointerId);
      roomClick.current = { pointerId: event.pointerId, point: localPoint(event) };
    } else if (tool === 'select') {
      const point = localPoint(event);
      if (
        !event.shiftKey &&
        selectedObject &&
        !selectedObject.locked &&
        isNearObjectRotationHandle(
          selectedObject,
          point,
          viewport,
          event.pointerType === 'touch' ? 18 : 11,
        )
      ) {
        event.currentTarget.setPointerCapture(event.pointerId);
        objectRotate.current = {
          pointerId: event.pointerId,
          startPoint: point,
          original: objectsById[selectedObject.id],
        };
        setRotatingObject(true);
        return;
      }
      if (
        !event.shiftKey &&
        selectedObject &&
        !selectedObject.locked &&
        isNearObjectResizeHandle(
          selectedObject,
          point,
          viewport,
          event.pointerType === 'touch' ? 18 : 11,
        )
      ) {
        event.currentTarget.setPointerCapture(event.pointerId);
        objectResize.current = {
          pointerId: event.pointerId,
          startPoint: point,
          original: objectsById[selectedObject.id],
        };
        setResizingObject(true);
        return;
      }
      const objectHit = hitTestLayoutObject(objects, point, viewport);
      if (objectHit) {
        if (event.shiftKey) {
          toggleObjectSelection(objectHit.id);
          return;
        }
        const moveIds = selectedObjectIds.includes(objectHit.id)
          ? selectedObjectIds
          : [objectHit.id];
        if (!selectedObjectIds.includes(objectHit.id)) selectObject(objectHit.id);
        if (objectHit.locked) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const selectedIds = new Set(moveIds);
        objectMove.current = {
          pointerId: event.pointerId,
          startPoint: point,
          originals: objects.filter((object) => selectedIds.has(object.id) && !object.locked),
          stationary: objects.filter((object) => !selectedIds.has(object.id) || object.locked),
          primaryId: objectHit.id,
          viewport,
        };
        setMovingObject(true);
        return;
      }
      if (event.shiftKey) {
        beginMarquee(event, point, true);
        return;
      }
      selectObject(null);
      const hit = hitTestRoom(rooms, point, viewport, event.pointerType === 'touch' ? 18 : 10);
      if (!hit) {
        selectRoom(null);
        beginMarquee(event, point, false);
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
    const currentObjectResize = objectResize.current;
    const currentObjectMove = objectMove.current;
    const currentObjectRotate = objectRotate.current;
    const currentMarquee = marquee.current;
    if (currentObjectResize?.pointerId === event.pointerId) {
      setObjectEditPreview(
        resizeObjectFromScreenDrag(
          currentObjectResize.original,
          currentObjectResize.startPoint,
          point,
          viewport,
        ),
      );
    } else if (currentObjectRotate?.pointerId === event.pointerId) {
      setObjectEditPreview(
        rotateObjectFromScreenDrag(
          currentObjectRotate.original,
          currentObjectRotate.startPoint,
          point,
          viewport,
        ),
      );
    } else if (currentObjectMove?.pointerId === event.pointerId) {
      if (
        Math.hypot(
          point.x - currentObjectMove.startPoint.x,
          point.y - currentObjectMove.startPoint.y,
        ) > 4
      ) {
        const rawDelta = {
          x: (point.x - currentObjectMove.startPoint.x) / currentObjectMove.viewport.scale,
          y: (point.y - currentObjectMove.startPoint.y) / currentObjectMove.viewport.scale,
        };
        const snapped = snapObjectMove(
          currentObjectMove.originals,
          currentObjectMove.primaryId,
          currentObjectMove.stationary,
          rawDelta,
          currentObjectMove.viewport,
        );
        setObjectMovePreview(
          Object.fromEntries(
            currentObjectMove.originals.map((object) => [
              object.id,
              { ...object, x: object.x + snapped.delta.x, y: object.y + snapped.delta.y },
            ]),
          ),
        );
        setMoveSnap(snapped);
      } else {
        setObjectMovePreview(null);
        setMoveSnap(null);
      }
    } else if (currentMarquee?.pointerId === event.pointerId) {
      currentMarquee.current = point;
      setMarqueeRect({ start: currentMarquee.start, current: point });
    } else if (currentVertexDrag?.pointerId === event.pointerId) {
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
      const nearHandle =
        tool === 'select' &&
        selectedObject !== undefined &&
        !selectedObject.locked &&
        isNearObjectResizeHandle(selectedObject, point, viewport);
      const nearRotateHandle =
        tool === 'select' &&
        selectedObject !== undefined &&
        !selectedObject.locked &&
        isNearObjectRotationHandle(selectedObject, point, viewport);
      const objectHit = tool === 'select' ? hitTestLayoutObject(objects, point, viewport) : null;
      setHoveredObjectHandle(nearHandle);
      setHoveredObjectRotateHandle(nearRotateHandle);
      setHoveredObject(objectHit !== null && !objectHit.locked);
      const hoveredHit =
        tool === 'select' && !objectHit && !nearHandle && !nearRotateHandle
          ? hitTestRoom(rooms, point, viewport)
          : null;
      setHoveredEditVertex(hoveredHit?.kind === 'vertex');
      setHoveredRoomInterior(hoveredHit?.kind === 'interior');
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (marquee.current?.pointerId === event.pointerId) {
      const selection = marquee.current;
      marquee.current = null;
      setMarqueeRect(null);
      const point = localPoint(event);
      if (Math.hypot(point.x - selection.start.x, point.y - selection.start.y) > 4) {
        const ids = objectsInSelectionRect(
          objects,
          selectionRectBetween(selection.start, point),
          viewport,
        );
        selectObjects(selection.additive ? [...selection.baseIds, ...ids] : ids);
      }
      return;
    }
    if (objectResize.current?.pointerId === event.pointerId) {
      const edit = objectResize.current;
      objectResize.current = null;
      setResizingObject(false);
      setObjectEditPreview(null);
      const candidate = resizeObjectFromScreenDrag(
        edit.original,
        edit.startPoint,
        localPoint(event),
        viewport,
      );
      updateLayoutObject(edit.original.id, {
        x: candidate.x,
        y: candidate.y,
        width: candidate.width,
        height: candidate.height,
      });
      return;
    }
    if (objectRotate.current?.pointerId === event.pointerId) {
      const edit = objectRotate.current;
      objectRotate.current = null;
      setRotatingObject(false);
      setObjectEditPreview(null);
      const candidate = rotateObjectFromScreenDrag(
        edit.original,
        edit.startPoint,
        localPoint(event),
        viewport,
      );
      updateLayoutObject(edit.original.id, { rotation: candidate.rotation });
      return;
    }
    if (objectMove.current?.pointerId === event.pointerId) {
      const edit = objectMove.current;
      objectMove.current = null;
      setMovingObject(false);
      setObjectMovePreview(null);
      setMoveSnap(null);
      const point = localPoint(event);
      if (Math.hypot(point.x - edit.startPoint.x, point.y - edit.startPoint.y) > 4) {
        const snapped = snapObjectMove(
          edit.originals,
          edit.primaryId,
          edit.stationary,
          {
            x: (point.x - edit.startPoint.x) / edit.viewport.scale,
            y: (point.y - edit.startPoint.y) / edit.viewport.scale,
          },
          edit.viewport,
        );
        moveLayoutObjects(
          edit.originals.map((object) => object.id),
          snapped.delta,
        );
      }
      return;
    }
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
    if (
      click?.pointerId !== event.pointerId ||
      (tool !== 'room' && tool !== 'divide' && tool !== 'object')
    )
      return;
    const point = localPoint(event);
    if (Math.hypot(point.x - click.point.x, point.y - click.point.y) > 4) return;
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x > event.currentTarget.clientWidth ||
      point.y > event.currentTarget.clientHeight
    )
      return;
    if (tool === 'object') {
      if (!selectedPaletteItemId || !selectedPaletteItem) return;
      const center = snapObjectPlacement(point, viewport, objects, objectPlacement).center;
      if (
        !activeFloorId ||
        !createLayoutObject(activeFloorId, selectedPaletteItemId, center, objectPlacement)
      ) {
        setRoomError('가구를 배치할 수 없습니다. 현재 층을 확인해 주세요.');
      } else {
        setRoomError(null);
      }
      return;
    }
    if (tool === 'divide') {
      const sourceRoom = divisionDraft && roomsById[divisionDraft.roomId];
      const snap = findRoomBoundarySnap(
        sourceRoom ? [sourceRoom] : rooms,
        point,
        viewport,
        divisionDraft?.roomId ?? selectedRoomId,
        event.pointerType === 'touch' ? 18 : 12,
      );
      if (!divisionDraft) {
        if (!snap) {
          setRoomError('분할할 방의 벽이나 꼭짓점을 클릭하세요.');
          return;
        }
        setDivisionDraft({ roomId: snap.roomId, points: [snap.world] });
        selectRoom(snap.roomId);
        setRoomError(null);
        return;
      }
      if (!sourceRoom) {
        setDivisionDraft(null);
        setRoomError('분할할 방을 찾을 수 없습니다.');
        return;
      }
      if (!snap) {
        const bend =
          snapRoomPoint(point, divisionDraft.points.at(-1), viewport)?.world ??
          screenToWorld(point, viewport);
        if (!canAddDivisionBend(sourceRoom.vertices, divisionDraft.points, bend)) {
          setRoomError('꺾임점은 방 내부에 두고 벽이 방 밖으로 나가지 않게 해 주세요.');
          return;
        }
        setDivisionDraft({ ...divisionDraft, points: [...divisionDraft.points, bend] });
        setRoomError(null);
        return;
      }
      const path = [...divisionDraft.points, snap.world];
      if (!splitPolygon(sourceRoom.vertices, path)) {
        setRoomError('분할 선이 교차하지 않고 방 내부를 둘로 나누어야 합니다.');
        return;
      }
      if (!splitRoom(divisionDraft.roomId, path)) {
        setRoomError('공간을 분할할 수 없습니다. 다시 시도해 주세요.');
        return;
      }
      setDivisionDraft(null);
      setHoverPoint(null);
      setRoomError(null);
      return;
    }
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

  const finishInteraction = useCallback(() => {
    drag.current = null;
    roomClick.current = null;
    marquee.current = null;
    setMarqueeRect(null);
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
    if (objectResize.current) {
      objectResize.current = null;
      setObjectEditPreview(null);
      setResizingObject(false);
    }
    if (objectMove.current) {
      objectMove.current = null;
      setObjectMovePreview(null);
      setMoveSnap(null);
      setMovingObject(false);
    }
    if (objectRotate.current) {
      objectRotate.current = null;
      setObjectEditPreview(null);
      setRotatingObject(false);
    }
    setDragging(false);
  }, [setRoomEditPreview, setObjectEditPreview, setObjectMovePreview]);

  const undoRoomDraftClick = useCallback(() => {
    roomClick.current = null;
    undoRoomDraftVertex();
    setHoverPoint(null);
    setRoomError(null);
  }, [undoRoomDraftVertex]);

  const undoDivisionClick = useCallback(() => {
    roomClick.current = null;
    undoDivisionDraftPoint();
    setHoverPoint(null);
    setRoomError(null);
  }, [undoDivisionDraftPoint]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      const action = resolveEditorShortcut(event);
      if (!action) return;
      if (action === 'pan') {
        if (isSpaceActivationTarget(event.target)) return;
        event.preventDefault();
        setSpacePressed(true);
        return;
      }

      const pointerActive = Boolean(
        drag.current ||
        vertexDrag.current ||
        roomDrag.current ||
        objectResize.current ||
        objectMove.current ||
        objectRotate.current ||
        marquee.current ||
        roomClick.current,
      );
      if (action === 'cancel') {
        if (pointerActive) {
          event.preventDefault();
          finishInteraction();
          setGeometryError(null);
        } else if (tool === 'divide' && divisionDraft) {
          event.preventDefault();
          undoDivisionClick();
        } else if (tool === 'room' && roomDraftVertices.length > 0) {
          event.preventDefault();
          undoRoomDraftClick();
        } else if (tool === 'object' && selectedPaletteItemId) {
          event.preventDefault();
          clearPaletteItem();
        } else if (tool === 'select' && (selectedObjectIds.length > 0 || selectedRoomId)) {
          event.preventDefault();
          selectObject(null);
        }
        return;
      }
      if (pointerActive) return;
      if (typeof action === 'object') {
        event.preventDefault();
        setTool(action.tool);
        return;
      }
      if (action === 'undo' || action === 'redo') {
        event.preventDefault();
        if (action === 'undo') undoEditorCommand();
        else redoEditorCommand();
        return;
      }
      if (action === 'backspace') {
        if (tool === 'divide' && divisionDraft) {
          event.preventDefault();
          undoDivisionClick();
        } else if (tool === 'room' && roomDraftVertices.length > 0) {
          event.preventDefault();
          undoRoomDraftClick();
        } else if (tool === 'select' && selectedObjectIds.length > 0) {
          event.preventDefault();
          deleteSelectedObjects();
        }
        return;
      }
      if (action === 'delete' && tool === 'select' && selectedObjectIds.length > 0) {
        event.preventDefault();
        deleteSelectedObjects();
      } else if (action === 'copy' && tool === 'select' && selectedObjectIds.length > 0) {
        if (copySelectedObjects() > 0) event.preventDefault();
      } else if (action === 'paste' && tool === 'select') {
        if (pasteCopiedObjects().length > 0) event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(false);
    };
    const onBlur = () => setSpacePressed(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [
    tool,
    selectedObjectIds.length,
    selectedRoomId,
    selectedPaletteItemId,
    divisionDraft,
    roomDraftVertices.length,
    finishInteraction,
    setGeometryError,
    undoDivisionClick,
    undoRoomDraftClick,
    clearPaletteItem,
    selectObject,
    setTool,
  ]);

  return (
    <div className={styles.wrapper}>
      <div
        aria-label="도면 편집 영역"
        className={`${styles.canvas} ${dragging ? styles.dragging : ''} ${spacePressed || tool === 'pan' ? styles.pan : ''} ${tool === 'object' && !selectedPaletteItem && !spacePressed ? styles.objectIdle : ''} ${snapCuePoint ? styles.snapReady : ''} ${tool === 'select' && !spacePressed ? styles.select : ''} ${movingVertex || (!spacePressed && tool === 'select' && hoveredEditVertex) ? styles.vertexDragging : ''} ${movingRoom ? styles.roomDragging : !movingVertex && !spacePressed && tool === 'select' && hoveredRoomInterior ? styles.roomReady : ''} ${!spacePressed && tool === 'select' && hoveredObject ? styles.objectHover : ''} ${movingObject ? styles.objectMoving : ''} ${resizingObject || (!spacePressed && tool === 'select' && hoveredObjectHandle) ? styles.objectResizeCursor : ''} ${rotatingObject || (!spacePressed && tool === 'select' && hoveredObjectRotateHandle) ? styles.objectRotateCursor : ''} ${marqueeRect ? styles.marqueeSelecting : ''}`}
        onWheel={handleWheel}
        onContextMenu={(event) => {
          if (tool !== 'object') return;
          event.preventDefault();
          roomClick.current = null;
          clearPaletteItem();
          setHoverPoint(null);
          setRoomError(null);
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          setHoverPoint(null);
          setHoveredEditVertex(false);
          setHoveredRoomInterior(false);
          setHoveredObject(false);
          setHoveredObjectHandle(false);
          setHoveredObjectRotateHandle(false);
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
          {displayedObjects.map((object) => (
            <LayoutObjectShape key={object.id} object={object} viewport={viewport} />
          ))}
          {tool === 'select' &&
            selectedObjectIds.length > 1 &&
            displayedObjects
              .filter((object) => selectedObjectIds.includes(object.id))
              .map((object) => {
                const origin = worldToScreen({ x: object.x, y: object.y }, viewport);
                const center = worldToScreen(
                  { x: object.x + object.width / 2, y: object.y + object.height / 2 },
                  viewport,
                );
                return (
                  <g
                    key={`selection-${object.id}`}
                    transform={`rotate(${object.rotation} ${center.x} ${center.y})`}
                  >
                    <rect
                      className={`${styles.objectSelectionBounds} ${object.locked ? styles.lockedSelectionBounds : ''}`}
                      x={origin.x}
                      y={origin.y}
                      width={object.width * viewport.scale}
                      height={object.height * viewport.scale}
                    />
                  </g>
                );
              })}
          {tool === 'select' && selectedObject && selectedObjectOrigin && selectedObjectCenter && (
            <g
              transform={`rotate(${selectedObject.rotation} ${selectedObjectCenter.x} ${selectedObjectCenter.y})`}
            >
              <rect
                className={`${styles.objectSelectionBounds} ${selectedObject.locked ? styles.lockedSelectionBounds : ''}`}
                x={selectedObjectOrigin.x}
                y={selectedObjectOrigin.y}
                width={selectedObject.width * viewport.scale}
                height={selectedObject.height * viewport.scale}
              />
              {!selectedObject.locked && (
                <>
                  <rect
                    className={styles.objectResizeHandle}
                    x={selectedObjectOrigin.x + selectedObject.width * viewport.scale - 6}
                    y={selectedObjectOrigin.y + selectedObject.height * viewport.scale - 6}
                    width={12}
                    height={12}
                    rx={2}
                  />
                  <line
                    className={styles.objectRotationStem}
                    x1={selectedObjectCenter.x}
                    y1={selectedObjectOrigin.y}
                    x2={selectedObjectCenter.x}
                    y2={selectedObjectOrigin.y - 24}
                  />
                  <circle
                    className={styles.objectRotationHandle}
                    cx={selectedObjectCenter.x}
                    cy={selectedObjectOrigin.y - 24}
                    r={6}
                  />
                </>
              )}
            </g>
          )}
          {moveSnap?.xGuide && (
            <line
              className={styles.objectMoveGuide}
              data-kind={moveSnap.xGuide.kind}
              x1={worldToScreen({ x: moveSnap.xGuide.world, y: 0 }, viewport).x}
              y1={0}
              x2={worldToScreen({ x: moveSnap.xGuide.world, y: 0 }, viewport).x}
              y2="100%"
            />
          )}
          {moveSnap?.yGuide && (
            <line
              className={styles.objectMoveGuide}
              data-kind={moveSnap.yGuide.kind}
              x1={0}
              y1={worldToScreen({ x: 0, y: moveSnap.yGuide.world }, viewport).y}
              x2="100%"
              y2={worldToScreen({ x: 0, y: moveSnap.yGuide.world }, viewport).y}
            />
          )}
          {marqueeBounds && (
            <rect
              className={styles.marqueeSelection}
              x={marqueeBounds.left}
              y={marqueeBounds.top}
              width={marqueeBounds.right - marqueeBounds.left}
              height={marqueeBounds.bottom - marqueeBounds.top}
            />
          )}
          {placementSnap && placementScreen && (
            <g className={styles.objectSnapGuide}>
              {placementSnap.horizontalReference && (
                <line
                  x1={worldToScreen(placementSnap.horizontalReference, viewport).x}
                  y1={placementScreen.y}
                  x2={placementScreen.x}
                  y2={placementScreen.y}
                />
              )}
              {placementSnap.verticalReference && (
                <line
                  x1={placementScreen.x}
                  y1={worldToScreen(placementSnap.verticalReference, viewport).y}
                  x2={placementScreen.x}
                  y2={placementScreen.y}
                />
              )}
              {placementSnap.gapGuide && (
                <g className={styles.objectGapGuide}>
                  {[placementSnap.gapGuide.first, placementSnap.gapGuide.second].map(
                    ([start, end], index) => {
                      const a = worldToScreen(start, viewport);
                      const b = worldToScreen(end, viewport);
                      return (
                        <g key={index}>
                          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                          {b.x - a.x >= 42 && (
                            <text x={(a.x + b.x) / 2} y={a.y - 5} textAnchor="middle">
                              {Number(placementSnap.gapGuide!.meters.toFixed(2))}m
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
          {objectPreview && (
            <LayoutObjectShape object={objectPreview} viewport={viewport} preview />
          )}
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
          {tool === 'divide' && divisionDraft && (
            <g>
              {divisionScreenPoints.length > 1 && (
                <polyline
                  className={styles.divisionPath}
                  points={divisionScreenPoints.map((point) => `${point.x},${point.y}`).join(' ')}
                />
              )}
              {divisionHoverScreen && (
                <line
                  className={
                    divisionReady || divisionBendReady
                      ? styles.divisionPreview
                      : styles.divisionPreviewInvalid
                  }
                  x1={divisionScreenPoints.at(-1)!.x}
                  y1={divisionScreenPoints.at(-1)!.y}
                  x2={divisionHoverScreen.x}
                  y2={divisionHoverScreen.y}
                />
              )}
              {divisionScreenPoints.map((point, index) => (
                <circle
                  key={index}
                  className={index === 0 ? styles.divisionStart : styles.divisionBend}
                  cx={point.x}
                  cy={point.y}
                  r={index === 0 ? 6 : 5}
                />
              ))}
            </g>
          )}
          {tool === 'room' &&
            draftWalls.map((wall, index) => {
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
          {tool === 'room' &&
            screenVertices.map((point, index) => (
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
          {tool === 'room' &&
            draftWalls.map((wall, index) => (
              <WallLengthLabel key={index} wall={wall} viewport={viewport} />
            ))}
        </svg>
        {snapCuePoint && (
          <div
            className={`${styles.snapCue} ${roomSnap || divisionInteriorSnap ? styles.guideSnapCue : ''} ${divisionDraft && ((divisionSnap && !divisionReady) || (divisionInteriorSnap && !divisionBendReady)) ? styles.invalidSnapCue : ''}`}
            style={{ left: snapCuePoint.x, top: snapCuePoint.y }}
            aria-hidden="true"
          >
            <span className={styles.snapCursor} />
            <span className={styles.snapLabel}>{snapLabel}</span>
          </div>
        )}
        {placementScreen && (
          <div
            className={styles.objectPlacementHint}
            style={{
              left: placementScreen.x,
              top: placementScreen.y,
            }}
            aria-hidden="true"
          >
            {placementHint}
          </div>
        )}
        {roomDraftVertices.length === 0 && rooms.length === 0 && objects.length === 0 && (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>◇</span>
            <strong>
              {tool === 'room'
                ? '공간의 첫 점을 클릭하세요'
                : tool === 'divide'
                  ? '먼저 공간을 만들어 주세요'
                  : tool === 'object'
                    ? selectedPaletteItem
                      ? '도면을 클릭해 물품을 배치하세요'
                      : '배치할 물품을 선택하세요'
                    : '새 도면을 시작할 준비가 됐어요'}
            </strong>
            <span>
              {tool === 'room'
                ? '세 점 이상 찍은 뒤 시작점을 클릭하면 공간이 완성됩니다.'
                : tool === 'divide'
                  ? '경계에서 시작해 내부 꺾임점을 찍고 다른 경계에서 끝내세요.'
                  : tool === 'object'
                    ? '오른쪽 Palette에서 물품을 선택하거나 추가할 수 있습니다.'
                    : '휠로 확대·축소하고, Space + 드래그로 이동해 보세요.'}
            </span>
          </div>
        )}
      </div>
      {tool === 'room' && roomDraftVertices.length > 0 && (
        <button className={styles.cancelDraft} type="button" onClick={undoRoomDraftClick}>
          직전 점 취소 <span>Esc</span>
        </button>
      )}
      {tool === 'divide' && divisionDraft && (
        <button className={styles.cancelDraft} type="button" onClick={undoDivisionClick}>
          직전 점 취소 <span>Esc</span>
        </button>
      )}
      <div className={styles.status}>
        <span>1칸 = 1m</span>
        <span>
          좌표 {displayedCursorWorld.x.toFixed(1)}m, {displayedCursorWorld.y.toFixed(1)}m
        </span>
        <span>{Math.round((viewport.scale / 80) * 100)}%</span>
        {tool === 'room' && roomDraftVertices.length > 0 && (
          <span>
            그리는 중: 점 {roomDraftVertices.length}개 · 벽 {draftWalls.length}개
          </span>
        )}
        {tool === 'divide' && (
          <span>
            {divisionDraft
              ? '분할 중: 내부 점으로 꺾고 경계에서 마무리 · Esc로 직전 점 취소'
              : '분할: 첫 번째 벽을 클릭하세요'}
          </span>
        )}
        {tool === 'object' && (
          <span>
            {selectedPaletteItem
              ? '물품 배치: 가로·세로/같은 간격 보정 · 우클릭으로 선택 해제'
              : '물품을 선택하세요 · V로 선택 도구'}
          </span>
        )}
        {tool === 'select' && (
          <span>물품 다중 선택: Shift+클릭 · 빈 도면 드래그 또는 Shift+드래그로 영역 선택</span>
        )}
        {roomError && <span className={styles.error}>{roomError}</span>}
        {geometryError && (
          <span className={styles.error}>{roomEditErrorMessage(geometryError)}</span>
        )}
      </div>
    </div>
  );
}
