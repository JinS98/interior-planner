import { worldToScreen } from '../../domain/geometry/coordinates';
import { snapScreenPointToGrid } from '../../domain/geometry/gridSnap';
import type { Point, Room, Viewport } from '../../types/layout';

export interface RoomBoundarySnap {
  roomId: string;
  world: Point;
  screen: Point;
}

/** Snap a division endpoint to an existing wall or corner, in screen-pixel distance. */
export function findRoomBoundarySnap(
  rooms: Room[],
  point: Point,
  viewport: Viewport,
  selectedRoomId: string | null = null,
  radius = 12,
): RoomBoundarySnap | null {
  const orderedRooms = [
    ...rooms.filter((room) => room.id === selectedRoomId),
    ...rooms.filter((room) => room.id !== selectedRoomId).reverse(),
  ];
  const gridSnap = snapScreenPointToGrid(point, viewport);
  for (const room of orderedRooms) {
    let closest: RoomBoundarySnap | null = null;
    let closestDistance = radius;
    for (const vertex of room.vertices) {
      const screen = worldToScreen(vertex, viewport);
      const distance = Math.hypot(screen.x - point.x, screen.y - point.y);
      if (distance <= closestDistance) {
        closest = { roomId: room.id, world: vertex, screen };
        closestDistance = distance;
      }
    }
    if (closest) return closest;

    for (let index = 0; index < room.vertices.length; index += 1) {
      const start = room.vertices[index];
      const end = room.vertices[(index + 1) % room.vertices.length];
      const a = worldToScreen(start, viewport);
      const b = worldToScreen(end, viewport);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared === 0) continue;
      const fraction = Math.max(
        0,
        Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared),
      );
      const screen = { x: a.x + fraction * dx, y: a.y + fraction * dy };
      if (
        gridSnap &&
        Math.hypot(gridSnap.screen.x - point.x, gridSnap.screen.y - point.y) <= radius
      ) {
        const gridFraction = Math.max(
          0,
          Math.min(
            1,
            ((gridSnap.screen.x - a.x) * dx + (gridSnap.screen.y - a.y) * dy) / lengthSquared,
          ),
        );
        if (
          Math.hypot(
            gridSnap.screen.x - (a.x + gridFraction * dx),
            gridSnap.screen.y - (a.y + gridFraction * dy),
          ) <= 1e-5
        ) {
          return { roomId: room.id, world: gridSnap.world, screen: gridSnap.screen };
        }
      }
      const distance = Math.hypot(screen.x - point.x, screen.y - point.y);
      if (distance <= closestDistance) {
        closest = {
          roomId: room.id,
          world: {
            x: start.x + fraction * (end.x - start.x),
            y: start.y + fraction * (end.y - start.y),
          },
          screen,
        };
        closestDistance = distance;
      }
    }
    if (closest) return closest;
  }
  return null;
}
