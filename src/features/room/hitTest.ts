import { worldToScreen } from '../../domain/geometry/coordinates';
import type { Point, Room, Viewport } from '../../types/layout';

export type RoomHit =
  | { roomId: string; kind: 'vertex'; index: number }
  | { roomId: string; kind: 'wall'; index: number }
  | { roomId: string; kind: 'interior' };

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const fraction =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
        );
  return Math.hypot(point.x - start.x - fraction * dx, point.y - start.y - fraction * dy);
}

function containsPoint(vertices: Point[], point: Point): boolean {
  let inside = false;
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index++) {
    const start = vertices[previous];
    const end = vertices[index];
    if (
      start.y > point.y !== end.y > point.y &&
      point.x < ((end.x - start.x) * (point.y - start.y)) / (end.y - start.y) + start.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function hitTestRoom(
  rooms: Room[],
  point: Point,
  viewport: Viewport,
  radius = 10,
): RoomHit | null {
  const screenRooms = [...rooms].reverse().map((room) => ({
    id: room.id,
    vertices: room.vertices.map((vertex) => worldToScreen(vertex, viewport)),
  }));

  for (const room of screenRooms) {
    const index = room.vertices.findIndex(
      (vertex) => Math.hypot(vertex.x - point.x, vertex.y - point.y) <= radius,
    );
    if (index !== -1) return { roomId: room.id, kind: 'vertex', index };
  }
  for (const room of screenRooms) {
    for (let index = 0; index < room.vertices.length; index += 1) {
      if (
        distanceToSegment(
          point,
          room.vertices[index],
          room.vertices[(index + 1) % room.vertices.length],
        ) <=
        radius - 2
      ) {
        return { roomId: room.id, kind: 'wall', index };
      }
    }
  }
  for (const room of screenRooms) {
    if (containsPoint(room.vertices, point)) return { roomId: room.id, kind: 'interior' };
  }
  return null;
}
