import { screenToWorld, worldToScreen } from '../../domain/geometry/coordinates';
import { snapScreenPointToGrid } from '../../domain/geometry/gridSnap';
import type { LayoutObject, ObjectAppearance, Point, Viewport } from '../../types/layout';

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
  grid: boolean;
}

function centerOf(object: LayoutObject): Point {
  return { x: object.x + object.width / 2, y: object.y + object.height / 2 };
}

/** Aligns centers, then extends an existing horizontal row with the same visible edge gap. */
export function snapObjectPlacement(
  pointer: Point,
  viewport: Viewport,
  objects: LayoutObject[],
  appearance: Pick<ObjectAppearance, 'width' | 'height'>,
): ObjectPlacementSnap {
  const world = screenToWorld(pointer, viewport);
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
  const rows: LayoutObject[][] = [];
  for (const object of [...objects].sort((a, b) => centerOf(a).y - centerOf(b).y)) {
    const row = rows.at(-1);
    if (row && Math.abs(centerOf(row[0]).y - centerOf(object).y) * viewport.scale <= 2) {
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
      const rowY = centerOf(left).y;
      const gap = right.x - (left.x + left.width);
      if (gap <= 0.01) continue;

      for (const side of ['left', 'right'] as const) {
        const center = {
          x:
            side === 'right'
              ? right.x + right.width + gap + preset.width / 2
              : left.x - gap - preset.width / 2,
          y: rowY,
        };
        const target = worldToScreen(center, viewport);
        const distance = Math.hypot(pointer.x - target.x, pointer.y - target.y);
        if (distance > OBJECT_SNAP_RADIUS_PX || (spacing && distance >= spacing.distance)) continue;
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

  if (spacing) {
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
      horizontalReference: centerOf(spacing.right),
      verticalReference: null,
      gapGuide: { first, second, meters: spacing.gap },
      grid: false,
    };
  }

  return {
    center: {
      x: vertical?.reference.x ?? grid?.world.x ?? world.x,
      y: horizontal?.reference.y ?? grid?.world.y ?? world.y,
    },
    horizontalReference: horizontal?.reference ?? null,
    verticalReference: vertical?.reference ?? null,
    gapGuide: null,
    grid: grid !== null,
  };
}
