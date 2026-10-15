import type { LayoutObject, ObjectSetMember, Point, Room } from '../../types/layout';
import { rotatePoint } from '../object/edit';
import {
  analyzeRoomBoundary,
  calculateRotationCandidates,
  footprintFitsRoom,
  type RotationCandidate,
  type RoomBoundary,
} from './geometry';

const EPSILON = 1e-8;
const MAX_GRID_POINTS = 50_000;
const MAX_RESULTS = 5_000;

export interface GridCandidateOptions {
  gridStepMeters: number;
  minimumAisleWidthMeters: number;
  /** 벽에 붙이는 배치를 허용하려면 0으로 둔다. */
  wallClearanceMeters?: number;
  maxCandidates?: number;
}

export interface GridPlacementCandidate {
  roomId: string;
  floorId: string;
  center: Point;
  rotation: number;
  /** 지정 중심을 빼면 RotationCandidate의 상대 좌표와 같다. */
  members: RotationCandidate['members'];
}

export type GridCandidateError = 'invalid-options' | 'invalid-geometry' | 'grid-too-dense';

export interface GridCandidateResult {
  candidates: GridPlacementCandidate[];
  error: GridCandidateError | null;
  truncated: boolean;
}

function objectCorners(object: LayoutObject): Point[] {
  const center = { x: object.x + object.width / 2, y: object.y + object.height / 2 };
  return [
    { x: object.x, y: object.y },
    { x: object.x + object.width, y: object.y },
    { x: object.x + object.width, y: object.y + object.height },
    { x: object.x, y: object.y + object.height },
  ].map((point) => rotatePoint(point, center, object.rotation));
}

function translatedFootprints(
  candidate: Pick<RotationCandidate, 'members'>,
  center: Point,
): Point[][] {
  return candidate.members.map((member) =>
    member.corners.map((point) => ({ x: point.x + center.x, y: point.y + center.y })),
  );
}

function projectPolygon(points: Point[], axis: Point): [number, number] {
  const projections = points.map((point) => point.x * axis.x + point.y * axis.y);
  return [Math.min(...projections), Math.max(...projections)];
}

/** 변 접촉은 허용하고, 양의 면적을 가진 겹침만 충돌로 판정한다. */
function polygonsOverlap(first: Point[], second: Point[]): boolean {
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index += 1) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const axis = { x: start.y - end.y, y: end.x - start.x };
      const [firstMin, firstMax] = projectPolygon(first, axis);
      const [secondMin, secondMax] = projectPolygon(second, axis);
      if (firstMax <= secondMin + EPSILON || secondMax <= firstMin + EPSILON) return false;
    }
  }
  return true;
}

function pointSegmentDistanceSquared(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const fraction =
    lengthSquared <= EPSILON
      ? 0
      : Math.max(
          0,
          Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
        );
  return (point.x - start.x - fraction * dx) ** 2 + (point.y - start.y - fraction * dy) ** 2;
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
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

function segmentDistanceSquared(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistanceSquared(a, c, d),
    pointSegmentDistanceSquared(b, c, d),
    pointSegmentDistanceSquared(c, a, b),
    pointSegmentDistanceSquared(d, a, b),
  );
}

function polygonDistanceSquared(first: Point[], second: Point[]): number {
  if (polygonsOverlap(first, second)) return 0;
  let minimum = Infinity;
  for (let a = 0; a < first.length; a += 1) {
    for (let b = 0; b < second.length; b += 1) {
      minimum = Math.min(
        minimum,
        segmentDistanceSquared(
          first[a],
          first[(a + 1) % first.length],
          second[b],
          second[(b + 1) % second.length],
        ),
      );
    }
  }
  return minimum;
}

function clearOfWalls(
  boundary: RoomBoundary,
  footprints: Point[][],
  clearanceMeters: number,
): boolean {
  if (clearanceMeters === 0) return true;
  const required = (clearanceMeters - EPSILON) ** 2;
  return footprints.every((corners) =>
    corners.every((start, index) => {
      const end = corners[(index + 1) % corners.length];
      return boundary.walls.every(
        (wall) => segmentDistanceSquared(start, end, wall.start, wall.end) >= required,
      );
    }),
  );
}

/** 구성 물품 자체의 겹침은 허용하고, 기존 물품과의 충돌·최소 간격만 검사한다. */
export function candidateHasClearance(
  candidate: Pick<RotationCandidate, 'members'>,
  center: Point,
  obstacles: Point[][],
  minimumAisleWidthMeters: number,
): boolean {
  if (
    !Number.isFinite(center.x) ||
    !Number.isFinite(center.y) ||
    !Number.isFinite(minimumAisleWidthMeters) ||
    minimumAisleWidthMeters < 0
  )
    return false;
  const footprints = translatedFootprints(candidate, center);
  return footprints.every((footprint) =>
    obstacles.every(
      (obstacle) =>
        !polygonsOverlap(footprint, obstacle) &&
        (minimumAisleWidthMeters === 0 ||
          polygonDistanceSquared(footprint, obstacle) >= (minimumAisleWidthMeters - EPSILON) ** 2),
    ),
  );
}

/** 후보 목록에서 순서대로 하나씩 골라 새 후보끼리도 충돌·통로 폭을 지키게 한다. */
export function selectCompatibleCandidates(
  candidates: GridPlacementCandidate[],
  existingObjects: LayoutObject[],
  minimumAisleWidthMeters: number,
  maxPlacements = 500,
): GridPlacementCandidate[] {
  if (
    !Number.isFinite(minimumAisleWidthMeters) ||
    minimumAisleWidthMeters < 0 ||
    !Number.isInteger(maxPlacements) ||
    maxPlacements < 1 ||
    maxPlacements > MAX_RESULTS
  )
    return [];
  const floorId = candidates[0]?.floorId;
  const obstacles = existingObjects
    .filter((object) => object.floorId === floorId)
    .map(objectCorners);
  const accepted: GridPlacementCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.floorId !== floorId) continue;
    if (!candidateHasClearance(candidate, candidate.center, obstacles, minimumAisleWidthMeters))
      continue;
    accepted.push(candidate);
    obstacles.push(...translatedFootprints(candidate, candidate.center));
    if (accepted.length >= maxPlacements) break;
  }
  return accepted;
}

/** World 원점에 고정된 격자를 훑어 Room 내부·벽 여유·물품 충돌·통로 폭을 만족하는 후보를 모은다. */
export function generateGridCandidates(
  room: Room,
  members: ObjectSetMember[],
  existingObjects: LayoutObject[],
  options: GridCandidateOptions,
): GridCandidateResult {
  const empty = (error: GridCandidateError): GridCandidateResult => ({
    candidates: [],
    error,
    truncated: false,
  });
  const {
    gridStepMeters: step,
    minimumAisleWidthMeters: aisle,
    wallClearanceMeters: wallClearance = 0,
    maxCandidates = 500,
  } = options;
  if (
    !Number.isFinite(step) ||
    step <= 0 ||
    !Number.isFinite(aisle) ||
    aisle < 0 ||
    !Number.isFinite(wallClearance) ||
    wallClearance < 0 ||
    !Number.isInteger(maxCandidates) ||
    maxCandidates < 1 ||
    maxCandidates > MAX_RESULTS
  )
    return empty('invalid-options');

  const boundary = analyzeRoomBoundary(room);
  const rotations = boundary ? calculateRotationCandidates(boundary, members) : [];
  const sameFloorObjects = existingObjects.filter((object) => object.floorId === room.floorId);
  if (
    !boundary ||
    rotations.length === 0 ||
    sameFloorObjects.some(
      (object) =>
        !Number.isFinite(object.x) ||
        !Number.isFinite(object.y) ||
        !Number.isFinite(object.width) ||
        !Number.isFinite(object.height) ||
        !Number.isFinite(object.rotation) ||
        object.width <= 0 ||
        object.height <= 0,
    )
  )
    return empty('invalid-geometry');

  const minX = Math.ceil((boundary.bounds.left - EPSILON) / step);
  const maxX = Math.floor((boundary.bounds.right + EPSILON) / step);
  const minY = Math.ceil((boundary.bounds.top - EPSILON) / step);
  const maxY = Math.floor((boundary.bounds.bottom + EPSILON) / step);
  const gridPoints = (maxX - minX + 1) * (maxY - minY + 1);
  if (!Number.isFinite(gridPoints) || gridPoints > MAX_GRID_POINTS) return empty('grid-too-dense');

  // 후보 상한에 걸리더라도 첫 탐색에서 방 전체를 고르게 훑는다.
  // 이후 빈 격자점을 점점 촘촘하게 채워 작은 step이 윗부분에만 몰리지 않게 한다.
  const xCount = maxX - minX + 1;
  const yCount = maxY - minY + 1;
  let initialStride = 1;
  while (
    initialStride < Math.max(xCount, yCount) &&
    Math.ceil(xCount / initialStride) * Math.ceil(yCount / initialStride) * rotations.length >
    maxCandidates
  ) initialStride *= 2;

  const obstacles = sameFloorObjects.map(objectCorners);
  const candidates: GridPlacementCandidate[] = [];
  for (let stride = initialStride; stride >= 1; stride /= 2) {
    for (let yIndex = minY; yIndex <= maxY; yIndex += stride) {
      for (let xIndex = minX; xIndex <= maxX; xIndex += stride) {
        if (
          stride !== initialStride &&
          (xIndex - minX) % (stride * 2) === 0 &&
          (yIndex - minY) % (stride * 2) === 0
        ) continue;
        const center = { x: xIndex * step, y: yIndex * step };
        for (const rotation of rotations) {
          if (!footprintFitsRoom(boundary, rotation, center)) continue;
          const footprints = translatedFootprints(rotation, center);
          if (!clearOfWalls(boundary, footprints, wallClearance)) continue;
          if (!candidateHasClearance(rotation, center, obstacles, aisle)) continue;
          candidates.push({
            roomId: room.id,
            floorId: room.floorId,
            center,
            rotation: rotation.rotation,
            members: rotation.members,
          });
          if (candidates.length >= maxCandidates) return { candidates, error: null, truncated: true };
        }
      }
    }
  }
  return { candidates, error: null, truncated: false };
}
