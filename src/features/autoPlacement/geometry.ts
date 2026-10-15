import { validatePolygon } from '../../domain/geometry/polygonValidation';
import { getWallSegments } from '../../domain/geometry/walls';
import type { ObjectSetMember, Point, Room } from '../../types/layout';
import { normalizeObjectRotation, rotatePoint } from '../object/edit';

const EPSILON = 1e-8;

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface RoomBoundary {
  vertices: Point[];
  bounds: Bounds;
  walls: {
    start: Point;
    end: Point;
    length: number;
    angle: number;
    tangent: Point;
    inwardNormal: Point;
  }[];
}

export interface RotationCandidate {
  /** 세트 전체를 중심 주위로 돌리는 각도. 각 구성 물품의 기존 회전은 유지된다. */
  rotation: number;
  bounds: Bounds;
  /** 세트 중심을 원점으로 둔 구성 물품의 보수적인 직사각형 외곽. */
  members: { center: Point; rotation: number; corners: Point[] }[];
}

function boundsOf(points: Point[]): Bounds {
  return {
    left: Math.min(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    right: Math.max(...points.map((point) => point.x)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

function signedDoubleArea(vertices: Point[]): number {
  return vertices.reduce((sum, start, index) => {
    const end = vertices[(index + 1) % vertices.length];
    return sum + start.x * end.y - end.x * start.y;
  }, 0);
}

/** 꼭짓점 순서와 관계없이 벽의 안쪽 방향을 얻는다. */
export function analyzeRoomBoundary(room: Pick<Room, 'vertices'>): RoomBoundary | null {
  if (validatePolygon(room.vertices)) return null;
  const vertices = room.vertices.map((point) => ({ ...point }));
  const winding = Math.sign(signedDoubleArea(vertices));
  const walls = getWallSegments(vertices, true).map(({ start, end, lengthMeters }) => {
    const tangent = {
      x: (end.x - start.x) / lengthMeters,
      y: (end.y - start.y) / lengthMeters,
    };
    const inwardX = -tangent.y * winding;
    const inwardY = tangent.x * winding;
    return {
      start,
      end,
      length: lengthMeters,
      angle: normalizeObjectRotation((Math.atan2(tangent.y, tangent.x) * 180) / Math.PI),
      tangent,
      inwardNormal: {
        x: Math.abs(inwardX) < EPSILON ? 0 : inwardX,
        y: Math.abs(inwardY) < EPSILON ? 0 : inwardY,
      },
    };
  });
  return { vertices, bounds: boundsOf(vertices), walls };
}

function memberCorners(member: ObjectSetMember): Point[] {
  const center = { x: member.x + member.width / 2, y: member.y + member.height / 2 };
  return [
    { x: member.x, y: member.y },
    { x: member.x + member.width, y: member.y },
    { x: member.x + member.width, y: member.y + member.height },
    { x: member.x, y: member.y + member.height },
  ].map((point) => rotatePoint(point, center, member.rotation));
}

/** 직각과 각 벽에 평행·수직인 회전을 중복 없이 계산한다. */
export function calculateRotationCandidates(
  boundary: RoomBoundary,
  members: ObjectSetMember[],
): RotationCandidate[] {
  if (
    members.length === 0 ||
    members.some(
      (member) =>
        !Number.isFinite(member.x) ||
        !Number.isFinite(member.y) ||
        !Number.isFinite(member.width) ||
        !Number.isFinite(member.height) ||
        !Number.isFinite(member.rotation) ||
        member.width <= 0 ||
        member.height <= 0,
    )
  )
    return [];

  const originalCorners = members.map(memberCorners);
  const originalBounds = boundsOf(originalCorners.flat());
  const anchor = {
    x: (originalBounds.left + originalBounds.right) / 2,
    y: (originalBounds.top + originalBounds.bottom) / 2,
  };
  const angles: number[] = [];
  for (const base of [0, ...boundary.walls.map((wall) => wall.angle)]) {
    for (const quarter of [0, 90, 180, 270]) {
      const angle = normalizeObjectRotation(base + quarter);
      if (
        !angles.some(
          (existing) =>
            Math.abs(existing - angle) < EPSILON || Math.abs(existing - angle) > 360 - EPSILON,
        )
      )
        angles.push(angle);
    }
  }

  return angles.map((rotation) => {
    const footprints = members.map((member, index) => {
      const center = rotatePoint(
        { x: member.x + member.width / 2, y: member.y + member.height / 2 },
        anchor,
        rotation,
      );
      const corners = originalCorners[index].map((point) => rotatePoint(point, anchor, rotation));
      return {
        center: { x: center.x - anchor.x, y: center.y - anchor.y },
        rotation: normalizeObjectRotation(member.rotation + rotation),
        corners: corners.map((point) => ({ x: point.x - anchor.x, y: point.y - anchor.y })),
      };
    });
    return {
      rotation,
      bounds: boundsOf(footprints.flatMap((member) => member.corners)),
      members: footprints,
    };
  });
}

function onSegment(point: Point, start: Point, end: Point): boolean {
  const cross = (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
  return (
    Math.abs(cross) <= EPSILON &&
    point.x >= Math.min(start.x, end.x) - EPSILON &&
    point.x <= Math.max(start.x, end.x) + EPSILON &&
    point.y >= Math.min(start.y, end.y) - EPSILON &&
    point.y <= Math.max(start.y, end.y) + EPSILON
  );
}

function insideOrOnBoundary(point: Point, boundary: RoomBoundary): boolean {
  let inside = false;
  for (const wall of boundary.walls) {
    if (onSegment(point, wall.start, wall.end)) return true;
    const { start, end } = wall;
    if (
      start.y > point.y !== end.y > point.y &&
      point.x < start.x + ((point.y - start.y) * (end.x - start.x)) / (end.y - start.y)
    )
      inside = !inside;
  }
  return inside;
}

function properCrossing(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const first = cross(a, b, c);
  const second = cross(a, b, d);
  const third = cross(c, d, a);
  const fourth = cross(c, d, b);
  return (
    ((first > EPSILON && second < -EPSILON) || (first < -EPSILON && second > EPSILON)) &&
    ((third > EPSILON && fourth < -EPSILON) || (third < -EPSILON && fourth > EPSILON))
  );
}

/** 경계 포함 여부만 판정한다. 통로 폭과 물품 충돌은 격자 후보 생성에서 검사한다. */
export function footprintFitsRoom(
  boundary: RoomBoundary,
  candidate: RotationCandidate,
  center: Point,
): boolean {
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return false;
  if (
    center.x + candidate.bounds.left < boundary.bounds.left - EPSILON ||
    center.x + candidate.bounds.right > boundary.bounds.right + EPSILON ||
    center.y + candidate.bounds.top < boundary.bounds.top - EPSILON ||
    center.y + candidate.bounds.bottom > boundary.bounds.bottom + EPSILON
  )
    return false;

  return candidate.members.every((member) => {
    const corners = member.corners.map((point) => ({
      x: point.x + center.x,
      y: point.y + center.y,
    }));
    if (corners.some((point) => !insideOrOnBoundary(point, boundary))) return false;
    for (let index = 0; index < corners.length; index += 1) {
      const start = corners[index];
      const end = corners[(index + 1) % corners.length];
      const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      if (!insideOrOnBoundary(midpoint, boundary)) return false;
      if (boundary.walls.some((wall) => properCrossing(start, end, wall.start, wall.end)))
        return false;
    }
    return true;
  });
}
