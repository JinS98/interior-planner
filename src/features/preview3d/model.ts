import { getWallSegments } from '../../domain/geometry/walls';
import { validatePolygon } from '../../domain/geometry/polygonValidation';
import { objectCenter, rotatePoint } from '../object/edit';
import type { LayoutObject, Point, Room } from '../../types/layout';

export interface PreviewWall {
  start: Point;
  end: Point;
  lengthMeters: number;
}

export interface PreviewBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface FloorPreviewModel {
  rooms: Pick<Room, 'id' | 'name' | 'vertices'>[];
  walls: PreviewWall[];
  bounds: PreviewBounds | null;
}

/** Frame the room and rotated object footprints in the same world coordinates. */
export function previewContentBounds(
  model: FloorPreviewModel,
  objects: LayoutObject[],
): PreviewBounds | null {
  const bounds = model.bounds
    ? { ...model.bounds }
    : {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
      };
  for (const object of objects) {
    const center = objectCenter(object);
    for (const point of [
      { x: object.x, y: object.y },
      { x: object.x + object.width, y: object.y },
      { x: object.x + object.width, y: object.y + object.height },
      { x: object.x, y: object.y + object.height },
    ]) {
      const corner = rotatePoint(point, center, object.rotation);
      bounds.minX = Math.min(bounds.minX, corner.x);
      bounds.minY = Math.min(bounds.minY, corner.y);
      bounds.maxX = Math.max(bounds.maxX, corner.x);
      bounds.maxY = Math.max(bounds.maxY, corner.y);
    }
  }
  return Number.isFinite(bounds.minX) ? bounds : null;
}

const PRECISION = 1e-6;
const rounded = (value: number) => Math.round(value / PRECISION) * PRECISION;

/** Polygon edges are the stored walls. Merge coincident and partly overlapping edges. */
export function createFloorPreviewModel(rooms: Room[]): FloorPreviewModel {
  const validRooms = rooms.filter((room) => validatePolygon(room.vertices) === null);
  if (validRooms.length === 0) return { rooms: [], walls: [], bounds: null };

  const vertices = validRooms.flatMap((room) => room.vertices);
  const bounds = vertices.reduce<PreviewBounds>(
    (current, point) => ({
      minX: Math.min(current.minX, point.x),
      minY: Math.min(current.minY, point.y),
      maxX: Math.max(current.maxX, point.x),
      maxY: Math.max(current.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );

  const lines = new Map<
    string,
    { ux: number; uy: number; offset: number; intervals: [number, number][] }
  >();
  for (const room of validRooms) {
    for (const { start, end, lengthMeters } of getWallSegments(room.vertices, true)) {
      if (lengthMeters < PRECISION) continue;
      let ux = (end.x - start.x) / lengthMeters;
      let uy = (end.y - start.y) / lengthMeters;
      if (ux < -PRECISION || (Math.abs(ux) <= PRECISION && uy < 0)) {
        ux = -ux;
        uy = -uy;
      }
      const offset = -uy * start.x + ux * start.y;
      const key = `${rounded(ux)}:${rounded(uy)}:${rounded(offset)}`;
      const from = ux * start.x + uy * start.y;
      const to = ux * end.x + uy * end.y;
      const line = lines.get(key) ?? { ux, uy, offset, intervals: [] };
      line.intervals.push([Math.min(from, to), Math.max(from, to)]);
      lines.set(key, line);
    }
  }

  const walls: PreviewWall[] = [];
  for (const { ux, uy, offset, intervals } of lines.values()) {
    intervals.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const [from, to] of intervals) {
      const last = merged.at(-1);
      if (last && from <= last[1] + PRECISION) last[1] = Math.max(last[1], to);
      else merged.push([from, to]);
    }
    for (const [from, to] of merged) {
      const start = { x: ux * from - uy * offset, y: uy * from + ux * offset };
      const end = { x: ux * to - uy * offset, y: uy * to + ux * offset };
      walls.push({ start, end, lengthMeters: to - from });
    }
  }

  return {
    rooms: validRooms.map(({ id, name, vertices }) => ({
      id,
      name,
      vertices: vertices.map(({ x, y }) => ({ x, y })),
    })),
    walls,
    bounds,
  };
}
