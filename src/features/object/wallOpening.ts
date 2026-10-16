import { polygonArea, screenToWorld } from '../../domain/geometry/coordinates';
import { GRID_SNAP_RADIUS_PX } from '../../domain/geometry/gridSnap';
import type { LayoutObject, Point, Room, Viewport } from '../../types/layout';
import { createFloorPreviewModel, type PreviewWall } from '../preview3d/model';

export interface WallOpeningAttachment {
  wall: PreviewWall;
  center: Point;
  rotation: number;
  from: number;
  to: number;
  distance: number;
}

export interface WallOpeningSnap extends WallOpeningAttachment {
  snapKind: 'vertex' | 'grid' | null;
}

const WALL_SNAP_RADIUS_PX = 18;
export const DOOR_OPEN_ANGLE_DEGREES = 38;

function pointInPolygon(point: Point, vertices: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i];
    const b = vertices[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** -1 is left of the wall in plan coordinates; +1 is right. */
export function doorSwingSide(object: LayoutObject, rooms: Room[]): -1 | 1 {
  const angle = (object.rotation * Math.PI) / 180;
  const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
  const center = { x: object.x + object.width / 2, y: object.y + object.height / 2 };
  const offset = Math.max(0.12, object.height / 2 + 0.05);
  const roomAreaOnSide = (side: -1 | 1) => {
    const sample = { x: center.x + normal.x * offset * side, y: center.y + normal.y * offset * side };
    const areas = rooms.filter((room) => pointInPolygon(sample, room.vertices))
      .map((room) => polygonArea(room.vertices));
    return areas.length ? Math.min(...areas) : null;
  };
  const negative = roomAreaOnSide(-1);
  const positive = roomAreaOnSide(1);
  if (negative !== null && positive !== null) return negative <= positive ? -1 : 1;
  if (negative !== null) return 1;
  if (positive !== null) return -1;
  return -1;
}

function attachmentOnWall(point: Point, width: number, wall: PreviewWall): WallOpeningAttachment | null {
  const { start, end, lengthMeters: length } = wall;
  if (width > length + 1e-6 || width <= 0 || length <= 0) return null;
  const ux = (end.x - start.x) / length;
  const uy = (end.y - start.y) / length;
  const along = (point.x - start.x) * ux + (point.y - start.y) * uy;
  const clamped = Math.max(width / 2, Math.min(length - width / 2, along));
  const center = { x: start.x + ux * clamped, y: start.y + uy * clamped };
  return {
    wall,
    center,
    rotation: (Math.atan2(uy, ux) * 180) / Math.PI,
    from: clamped - width / 2,
    to: clamped + width / 2,
    distance: Math.hypot(point.x - center.x, point.y - center.y),
  };
}

/** A wall opening always uses the nearest wall's center line and direction. */
export function snapWallOpening(
  pointer: Point,
  viewport: Viewport,
  rooms: Room[],
  width: number,
  maxDistancePx = WALL_SNAP_RADIUS_PX,
): WallOpeningSnap | null {
  const world = screenToWorld(pointer, viewport);
  let best: { wall: PreviewWall; distance: number } | null = null;
  for (const wall of createFloorPreviewModel(rooms).walls) {
    if (wall.lengthMeters < width) continue;
    const ux = (wall.end.x - wall.start.x) / wall.lengthMeters;
    const uy = (wall.end.y - wall.start.y) / wall.lengthMeters;
    const along = Math.max(0, Math.min(wall.lengthMeters,
      (world.x - wall.start.x) * ux + (world.y - wall.start.y) * uy));
    const distance = Math.hypot(world.x - wall.start.x - ux * along,
      world.y - wall.start.y - uy * along);
    if (distance * viewport.scale <= maxDistancePx &&
        (!best || distance < best.distance - 1e-6 ||
          (Math.abs(distance - best.distance) <= 1e-6 && wall.lengthMeters > best.wall.lengthMeters)))
      best = { wall, distance };
  }
  if (!best) return null;

  const wall = best.wall;
  const ux = (wall.end.x - wall.start.x) / wall.lengthMeters;
  const uy = (wall.end.y - wall.start.y) / wall.lengthMeters;
  const along = (world.x - wall.start.x) * ux + (world.y - wall.start.y) * uy;
  const min = width / 2;
  const max = wall.lengthMeters - width / 2;
  const validCenter = (value: number) => value >= min - 1e-6 && value <= max + 1e-6;
  let centerAlong = Math.max(min, Math.min(max, along));
  let snapKind: WallOpeningSnap['snapKind'] = null;

  const vertexCandidates = rooms.flatMap((room) => room.vertices).flatMap((vertex) => {
    const position = (vertex.x - wall.start.x) * ux + (vertex.y - wall.start.y) * uy;
    const perpendicular = Math.abs((vertex.x - wall.start.x) * uy - (vertex.y - wall.start.y) * ux);
    if (perpendicular > 1e-5 || position < -1e-5 || position > wall.lengthMeters + 1e-5 ||
        Math.abs(along - position) * viewport.scale > GRID_SNAP_RADIUS_PX) return [];
    return [position + width / 2, position - width / 2].filter(validCenter);
  });
  if (vertexCandidates.length) {
    centerAlong = vertexCandidates.reduce((bestCenter, value) =>
      Math.abs(value - along) < Math.abs(bestCenter - along) - 1e-6 ? value : bestCenter);
    snapKind = 'vertex';
  } else if (Math.abs(ux) > 0.999 || Math.abs(uy) > 0.999) {
    const axisStart = Math.abs(ux) > 0.999 ? wall.start.x : wall.start.y;
    const axisDirection = Math.abs(ux) > 0.999 ? ux : uy;
    const axisAtPointer = axisStart + axisDirection * along;
    const gridCandidates = Array.from({ length: 5 }, (_, i) => Math.round(axisAtPointer) + i - 2)
      .flatMap((grid) => {
        const gridAlong = (grid - axisStart) / axisDirection;
        return [gridAlong, gridAlong - width / 2, gridAlong + width / 2];
      })
      .filter((value) => validCenter(value) &&
        Math.abs(value - along) * viewport.scale <= GRID_SNAP_RADIUS_PX);
    if (gridCandidates.length) {
      centerAlong = gridCandidates.reduce((bestCenter, value) =>
        Math.abs(value - along) < Math.abs(bestCenter - along) ? value : bestCenter);
      snapKind = 'grid';
    }
  }
  const center = { x: wall.start.x + ux * centerAlong, y: wall.start.y + uy * centerAlong };
  return {
    wall, center, rotation: (Math.atan2(uy, ux) * 180) / Math.PI,
    from: centerAlong - width / 2, to: centerAlong + width / 2,
    distance: best.distance, snapKind,
  };
}

/** Re-evaluate attachment after room or object edits so stale doors never cut unrelated walls. */
export function attachedWallOpening(
  object: LayoutObject,
  walls: PreviewWall[],
): WallOpeningAttachment | null {
  if (!object.wallOpening) return null;
  const center = { x: object.x + object.width / 2, y: object.y + object.height / 2 };
  let best: WallOpeningAttachment | null = null;
  for (const wall of walls) {
    const candidate = attachmentOnWall(center, object.width, wall);
    if (!candidate || candidate.distance > 0.03) continue;
    const angle = Math.abs(((object.rotation - candidate.rotation + 90) % 180 + 180) % 180 - 90);
    if (angle > 8) continue;
    if (!best || candidate.distance < best.distance) best = candidate;
  }
  return best;
}
