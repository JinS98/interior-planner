import { screenToWorld, worldToScreen } from '../../domain/geometry/coordinates';
import { snapScreenPointToGrid } from '../../domain/geometry/gridSnap';
import type { LayoutObject, ObjectAppearance, Point, Room, Viewport } from '../../types/layout';

export const OBJECT_SNAP_RADIUS_PX = 12;

interface GapGuide {
  first: [Point, Point];
  second: [Point, Point];
  meters: number;
}

export interface ObjectPlacementSnap {
  center: Point;
  horizontalReference: Point | null;
  verticalReference: Point | null;
  gapGuide: GapGuide | null;
  startLineGuide?: [Point, Point];
  grid: boolean;
  roomBoundary: boolean;
}

function snapToRoomBoundary(
  pointer: Point,
  viewport: Viewport,
  rooms: Room[],
  appearance: Pick<ObjectAppearance, 'width' | 'height'>,
): Point | null {
  const world = screenToWorld(pointer, viewport);
  let best: { center: Point; distance: number } | null = null;
  for (const room of rooms) {
    const vertices = room.vertices;
    const signedArea = vertices.reduce((sum, start, index) => {
      const end = vertices[(index + 1) % vertices.length];
      return sum + start.x * end.y - end.x * start.y;
    }, 0);
    for (let index = 0; index < vertices.length; index += 1) {
      const start = vertices[index];
      const end = vertices[(index + 1) % vertices.length];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy);
      if (length < 0.01) continue;
      const tangent = { x: dx / length, y: dy / length };
      const normal =
        signedArea >= 0 ? { x: -tangent.y, y: tangent.x } : { x: tangent.y, y: -tangent.x };
      const halfAlongWall =
        (Math.abs(tangent.x) * appearance.width + Math.abs(tangent.y) * appearance.height) / 2;
      if (halfAlongWall * 2 > length) continue;
      const halfInside =
        (Math.abs(normal.x) * appearance.width + Math.abs(normal.y) * appearance.height) / 2;
      const along = (world.x - start.x) * tangent.x + (world.y - start.y) * tangent.y;
      const clamped = Math.max(halfAlongWall, Math.min(length - halfAlongWall, along));
      const center = {
        x: start.x + tangent.x * clamped + normal.x * halfInside,
        y: start.y + tangent.y * clamped + normal.y * halfInside,
      };
      const nearestOnWall = {
        x: start.x + tangent.x * Math.max(0, Math.min(length, along)),
        y: start.y + tangent.y * Math.max(0, Math.min(length, along)),
      };
      const wallDistance = Math.hypot(world.x - nearestOnWall.x, world.y - nearestOnWall.y);
      const centerDistance = Math.hypot(world.x - center.x, world.y - center.y);
      const distance = Math.min(wallDistance, centerDistance) * viewport.scale;
      if (distance <= OBJECT_SNAP_RADIUS_PX && (!best || distance < best.distance)) {
        best = { center, distance };
      }
    }
  }
  return best?.center ?? null;
}

function centerOf(object: LayoutObject): Point {
  return { x: object.x + object.width / 2, y: object.y + object.height / 2 };
}

/** Aligns centers and extends existing rows or columns using the full placement footprint. */
export function snapObjectPlacement(
  pointer: Point,
  viewport: Viewport,
  objects: LayoutObject[],
  appearance: Pick<ObjectAppearance, 'width' | 'height'>,
  rooms: Room[] = [],
): ObjectPlacementSnap {
  const world = screenToWorld(pointer, viewport);
  const boundaryCenter = snapToRoomBoundary(pointer, viewport, rooms, appearance);
  const grid = snapScreenPointToGrid(pointer, viewport);
  const preset = appearance;
  let horizontal: { reference: Point; distance: number } | null = null;
  let vertical: { reference: Point; distance: number } | null = null;

  for (const object of objects) {
    const reference = centerOf(object);
    const screen = worldToScreen(reference, viewport);
    const dx = Math.abs(pointer.x - screen.x);
    const dy = Math.abs(pointer.y - screen.y);
    if (dx <= OBJECT_SNAP_RADIUS_PX && (!vertical || dx < vertical.distance)) {
      vertical = { reference, distance: dx };
    }
    if (dy <= OBJECT_SNAP_RADIUS_PX && (!horizontal || dy < horizontal.distance)) {
      horizontal = { reference, distance: dy };
    }
  }

  let spacing: {
    center: Point;
    left: LayoutObject;
    right: LayoutObject;
    gap: number;
    side: 'left' | 'right';
    distance: number;
  } | null = null;
  let verticalGapGuide: GapGuide | null = null;
  for (const alignment of ['center', 'start', 'end'] as const) {
    const rowAnchor = (object: LayoutObject) =>
      alignment === 'start'
        ? object.y
        : alignment === 'end'
          ? object.y + object.height
          : centerOf(object).y;
    const rows: LayoutObject[][] = [];
    for (const object of [...objects].sort((a, b) => rowAnchor(a) - rowAnchor(b))) {
      const row = rows.at(-1);
      if (row && Math.abs(rowAnchor(row[0]) - rowAnchor(object)) * viewport.scale <= 2) {
        row.push(object);
      } else {
        rows.push([object]);
      }
    }
    for (const row of rows) {
      row.sort((a, b) => a.x - b.x);
      for (let index = 0; index < row.length - 1; index += 1) {
        const left = row[index];
        const right = row[index + 1];
        const rowY = rowAnchor(left);
        const rawGap = right.x - (left.x + left.width);
        const gap = Math.abs(rawGap) < 1e-9 ? 0 : rawGap;
        if (gap < -1e-9) continue;

        for (const side of ['left', 'right'] as const) {
          const center = {
            x:
              side === 'right'
                ? right.x + right.width + gap + preset.width / 2
                : left.x - gap - preset.width / 2,
            y:
              alignment === 'start'
                ? rowY + preset.height / 2
                : alignment === 'end'
                  ? rowY - preset.height / 2
                  : rowY,
          };
          const target = worldToScreen(center, viewport);
          const distance = Math.hypot(pointer.x - target.x, pointer.y - target.y);
          if (distance > OBJECT_SNAP_RADIUS_PX || (spacing && distance >= spacing.distance))
            continue;
          const candidateLeft = center.x - preset.width / 2;
          const candidateRight = center.x + preset.width / 2;
          if (
            objects.some(
              (object) =>
                object.x < candidateRight - 1e-9 &&
                object.x + object.width > candidateLeft + 1e-9 &&
                object.y < center.y + preset.height / 2 - 1e-9 &&
                object.y + object.height > center.y - preset.height / 2 + 1e-9,
            )
          )
            continue;
          spacing = { center, left, right, gap, side, distance };
        }
      }
    }
  }
  for (const alignment of ['center', 'start', 'end'] as const) {
    const columnAnchor = (object: LayoutObject) =>
      alignment === 'start'
        ? object.x
        : alignment === 'end'
          ? object.x + object.width
          : centerOf(object).x;
    const columns: LayoutObject[][] = [];
    for (const object of [...objects].sort((a, b) => columnAnchor(a) - columnAnchor(b))) {
      const column = columns.at(-1);
      if (
        column &&
        Math.abs(columnAnchor(column[0]) - columnAnchor(object)) * viewport.scale <= 2
      ) {
        column.push(object);
      } else {
        columns.push([object]);
      }
    }
    for (const column of columns) {
      column.sort((a, b) => a.y - b.y);
      for (let index = 0; index < column.length - 1; index += 1) {
        const top = column[index];
        const bottom = column[index + 1];
        const rawGap = bottom.y - (top.y + top.height);
        const gap = Math.abs(rawGap) < 1e-9 ? 0 : rawGap;
        if (gap < -1e-9) continue;
        for (const side of ['top', 'bottom'] as const) {
          const center = {
            x:
              alignment === 'start'
                ? columnAnchor(top) + preset.width / 2
                : alignment === 'end'
                  ? columnAnchor(top) - preset.width / 2
                  : columnAnchor(top),
            y:
              side === 'bottom'
                ? bottom.y + bottom.height + gap + preset.height / 2
                : top.y - gap - preset.height / 2,
          };
          const target = worldToScreen(center, viewport);
          const distance = Math.hypot(pointer.x - target.x, pointer.y - target.y);
          if (distance > OBJECT_SNAP_RADIUS_PX || (spacing && distance >= spacing.distance))
            continue;
          const candidateTop = center.y - preset.height / 2;
          const candidateBottom = center.y + preset.height / 2;
          if (
            objects.some(
              (object) =>
                object.y < candidateBottom - 1e-9 &&
                object.y + object.height > candidateTop + 1e-9 &&
                object.x < center.x + preset.width / 2 - 1e-9 &&
                object.x + object.width > center.x - preset.width / 2 + 1e-9,
            )
          )
            continue;
          const guideX =
            Math.min(top.x, bottom.x, center.x - preset.width / 2) - 16 / viewport.scale;
          const first: [Point, Point] = [
            { x: guideX, y: top.y + top.height },
            { x: guideX, y: bottom.y },
          ];
          const second: [Point, Point] =
            side === 'bottom'
              ? [
                  { x: guideX, y: bottom.y + bottom.height },
                  { x: guideX, y: candidateTop },
                ]
              : [
                  { x: guideX, y: candidateBottom },
                  { x: guideX, y: top.y },
                ];
          spacing = {
            center,
            left: top,
            right: bottom,
            gap,
            side: side === 'bottom' ? 'right' : 'left',
            distance,
          };
          verticalGapGuide = { first, second, meters: gap };
        }
      }
    }
  }

  if (spacing) {
    if (verticalGapGuide) {
      return {
        center: spacing.center,
        horizontalReference: null,
        verticalReference: { x: spacing.center.x, y: centerOf(spacing.right).y },
        gapGuide: verticalGapGuide,
        grid: false,
        roomBoundary: false,
      };
    }
    const guideY =
      Math.min(spacing.left.y, spacing.right.y, spacing.center.y - preset.height / 2) -
      16 / viewport.scale;
    const first: [Point, Point] = [
      { x: spacing.left.x + spacing.left.width, y: guideY },
      { x: spacing.right.x, y: guideY },
    ];
    const second: [Point, Point] =
      spacing.side === 'right'
        ? [
            { x: spacing.right.x + spacing.right.width, y: guideY },
            { x: spacing.center.x - preset.width / 2, y: guideY },
          ]
        : [
            { x: spacing.center.x + preset.width / 2, y: guideY },
            { x: spacing.left.x, y: guideY },
          ];
    return {
      center: spacing.center,
      horizontalReference: { x: centerOf(spacing.right).x, y: spacing.center.y },
      verticalReference: null,
      gapGuide: { first, second, meters: spacing.gap },
      grid: false,
      roomBoundary: false,
    };
  }

  if (boundaryCenter) {
    return {
      center: boundaryCenter,
      horizontalReference: null,
      verticalReference: null,
      gapGuide: null,
      grid: false,
      roomBoundary: true,
    };
  }

  let rowStart: {
    left: number;
    top: number;
    bottom: number;
    centerX: number;
    distance: number;
  } | null = null;
  const snappedY = horizontal?.reference.y ?? grid?.world.y ?? world.y;
  const topOfPlacement = snappedY - preset.height / 2;
  const alignedRows: LayoutObject[][] = [];
  for (const object of [...objects].sort((a, b) => a.y - b.y)) {
    const row = alignedRows.at(-1);
    if (row && Math.abs(row[0].y - object.y) * viewport.scale <= 2) row.push(object);
    else alignedRows.push([object]);
  }
  for (const row of alignedRows) {
    if (row.length < 2) continue;
    const left = Math.min(...row.map((object) => object.x));
    const top = Math.min(...row.map((object) => object.y));
    const bottom = Math.max(...row.map((object) => object.y + object.height));
    if (topOfPlacement < bottom - 1e-9) continue;
    const centerX = left + preset.width / 2;
    const horizontalDistance = Math.abs(world.x - centerX) * viewport.scale;
    if (horizontalDistance > OBJECT_SNAP_RADIUS_PX) continue;
    const distance = topOfPlacement - bottom;
    if (!rowStart || distance < rowStart.distance)
      rowStart = { left, top, bottom, centerX, distance };
  }

  const center = {
    x: rowStart?.centerX ?? vertical?.reference.x ?? grid?.world.x ?? world.x,
    y: snappedY,
  };

  return {
    center,
    horizontalReference: horizontal?.reference ?? null,
    verticalReference: rowStart ? null : (vertical?.reference ?? null),
    gapGuide: null,
    startLineGuide: rowStart
      ? [
          { x: rowStart.left, y: rowStart.top },
          { x: rowStart.left, y: center.y + preset.height / 2 },
        ]
      : undefined,
    grid: grid !== null,
    roomBoundary: false,
  };
}
