import type { PolygonValidationError } from '../../domain/geometry/polygonValidation';
import type { Point, Viewport } from '../../types/layout';

export type RoomEditError = PolygonValidationError | 'room-not-found' | 'invalid-wall-length';

const messages: Record<RoomEditError, string> = {
  'too-few-vertices': '공간에는 서로 다른 점 세 개 이상이 필요합니다.',
  'non-finite-coordinate': '유효하지 않은 좌표입니다.',
  'short-wall': '벽 길이는 0.01m 이상이어야 합니다.',
  'self-intersection': '벽이 서로 교차하거나 겹칠 수 없습니다.',
  'zero-area': '면적이 없는 도형은 공간으로 만들 수 없습니다.',
  'room-not-found': '편집할 공간을 찾을 수 없습니다.',
  'invalid-wall-length': '벽 길이는 0.01m 이상이어야 합니다.',
};

export function roomEditErrorMessage(error: RoomEditError): string {
  return messages[error];
}

export function translateRoomVertices(vertices: Point[], delta: Point): Point[] {
  return vertices.map((vertex) => ({ x: vertex.x + delta.x, y: vertex.y + delta.y }));
}

export function translateRoomFromScreenDrag(
  vertices: Point[],
  start: Point,
  current: Point,
  viewport: Viewport,
): Point[] {
  return translateRoomVertices(vertices, {
    x: (current.x - start.x) / viewport.scale,
    y: (current.y - start.y) / viewport.scale,
  });
}
