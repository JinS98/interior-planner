import type { LayoutObject, Point, Viewport } from '../../types/layout';
import { objectCenter } from './edit';

export const OBJECT_MOVE_SNAP_RADIUS_PX = 12;

export interface ObjectMoveSnap {
  delta: Point;
  xGuide: { world: number; kind: 'grid' | 'object' } | null;
  yGuide: { world: number; kind: 'grid' | 'object' } | null;
}

/** 선택한 물품들의 간격을 유지하면서 격자 또는 다른 물품의 중심에 맞춘다. */
export function snapObjectMove(
  moving: LayoutObject[],
  primaryId: string,
  stationary: LayoutObject[],
  rawDelta: Point,
  viewport: Viewport,
): ObjectMoveSnap {
  const primary = moving.find((object) => object.id === primaryId) ?? moving[0];
  if (!primary) return { delta: rawDelta, xGuide: null, yGuide: null };

  function snapAxis(axis: 'x' | 'y') {
    const primaryValue = objectCenter(primary)[axis] + rawDelta[axis];
    const gridWorld = Math.round(primaryValue);
    const gridDistance = Math.abs(gridWorld - primaryValue) * viewport.scale;
    let best: {
      adjustment: number;
      world: number;
      distance: number;
      kind: 'grid' | 'object';
    } | null =
      gridDistance <= OBJECT_MOVE_SNAP_RADIUS_PX
        ? {
            adjustment: gridWorld - primaryValue,
            world: gridWorld,
            distance: gridDistance,
            kind: 'grid',
          }
        : null;
    for (const selected of moving) {
      const movedValue = objectCenter(selected)[axis] + rawDelta[axis];
      for (const other of stationary) {
        const reference = objectCenter(other)[axis];
        const distance = Math.abs(reference - movedValue) * viewport.scale;
        if (distance > OBJECT_MOVE_SNAP_RADIUS_PX) continue;
        if (best?.kind === 'object' && distance >= best.distance) continue;
        best = { adjustment: reference - movedValue, world: reference, distance, kind: 'object' };
      }
    }
    return best;
  }

  const x = snapAxis('x');
  const y = snapAxis('y');
  return {
    delta: { x: rawDelta.x + (x?.adjustment ?? 0), y: rawDelta.y + (y?.adjustment ?? 0) },
    xGuide: x ? { world: x.world, kind: x.kind } : null,
    yGuide: y ? { world: y.world, kind: y.kind } : null,
  };
}
