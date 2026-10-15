import { describe, expect, it } from 'vitest';
import { rotatePoint } from '../object/edit';
import type { ObjectSetMember, Point, Room } from '../../types/layout';
import { analyzeRoomBoundary, calculateRotationCandidates, footprintFitsRoom } from './geometry';

const rectangle: Room = {
  id: 'room',
  floorId: 'floor',
  name: '테스트 공간',
  vertices: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 3 },
  ],
};

function member(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation = 0,
): ObjectSetMember {
  return {
    category: 'furniture',
    type: 'desk',
    name: '책상',
    x,
    y,
    width,
    height,
    rotation,
    color: '#123456',
    shape: 'rectangle',
  };
}

describe('automatic placement geometry', () => {
  it('finds the same inward wall direction for either room vertex order', () => {
    const forward = analyzeRoomBoundary(rectangle)!;
    const reversed = analyzeRoomBoundary({ vertices: [...rectangle.vertices].reverse() })!;
    expect(forward.bounds).toEqual({ left: 0, top: 0, right: 4, bottom: 3 });
    expect(forward.walls).toHaveLength(4);
    expect(forward.walls[0]).toMatchObject({ length: 4, angle: 0, inwardNormal: { x: 0, y: 1 } });
    const reversedTop = reversed.walls.find((wall) => wall.start.y === 0 && wall.end.y === 0)!;
    expect(reversedTop.inwardNormal).toEqual({ x: 0, y: 1 });
    expect(
      analyzeRoomBoundary({
        vertices: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      }),
    ).toBeNull();
  });

  it('deduplicates right angles and includes rotations parallel to diagonal walls', () => {
    const boundary = analyzeRoomBoundary(rectangle)!;
    const candidates = calculateRotationCandidates(boundary, [member(-1, -0.5, 2, 1)]);
    expect(candidates.map((candidate) => candidate.rotation)).toEqual([0, 90, 180, 270]);
    expect(candidates[0].bounds).toEqual({ left: -1, top: -0.5, right: 1, bottom: 0.5 });
    expect(candidates[1].bounds.left).toBeCloseTo(-0.5);
    expect(candidates[1].bounds.top).toBeCloseTo(-1);
    expect(calculateRotationCandidates(boundary, [])).toEqual([]);

    const diagonal = analyzeRoomBoundary({
      vertices: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 5, y: 1 },
        { x: 1, y: 1 },
      ],
    })!;
    const diagonalAngles = calculateRotationCandidates(diagonal, [member(-1, -0.5, 2, 1)]).map(
      (candidate) => candidate.rotation,
    );
    expect(diagonalAngles).toContain(45);
    expect(diagonalAngles).toHaveLength(8);
  });

  it('preserves member offsets and individual angles during rigid group rotation', () => {
    const candidates = calculateRotationCandidates(analyzeRoomBoundary(rectangle)!, [
      member(-1.5, -0.5, 1, 1, 45),
      member(0.5, -0.5, 1, 1, 0),
    ]);
    const zero = candidates.find((candidate) => candidate.rotation === 0)!;
    const quarter = candidates.find((candidate) => candidate.rotation === 90)!;
    expect(quarter.members[0].rotation).toBe(135);
    expect(quarter.members[1].rotation).toBe(90);
    const originalDistance = Math.hypot(
      zero.members[0].center.x - zero.members[1].center.x,
      zero.members[0].center.y - zero.members[1].center.y,
    );
    const rotatedDistance = Math.hypot(
      quarter.members[0].center.x - quarter.members[1].center.x,
      quarter.members[0].center.y - quarter.members[1].center.y,
    );
    expect(rotatedDistance).toBeCloseTo(originalDistance);
  });

  it('tests a complete rotated footprint against the room, including concave cutouts', () => {
    const boundary = analyzeRoomBoundary(rectangle)!;
    const candidates = calculateRotationCandidates(boundary, [member(-1, -0.5, 2, 1)]);
    expect(footprintFitsRoom(boundary, candidates[0], { x: 2, y: 1.5 })).toBe(true);
    expect(footprintFitsRoom(boundary, candidates[0], { x: 0.5, y: 1.5 })).toBe(false);
    expect(footprintFitsRoom(boundary, candidates[1], { x: 0.5, y: 1.5 })).toBe(true);
    expect(footprintFitsRoom(boundary, candidates[0], { x: Number.NaN, y: 1 })).toBe(false);

    const concave = analyzeRoomBoundary({
      vertices: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 },
        { x: 4, y: 5 },
        { x: 4, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 5 },
        { x: 0, y: 5 },
      ],
    })!;
    const bridge = calculateRotationCandidates(concave, [member(-2.25, -0.25, 4.5, 0.5)])[0];
    const center: Point = { x: 2.5, y: 4.5 };
    expect(footprintFitsRoom(concave, bridge, center)).toBe(false);
  });

  it('accepts a wall-aligned candidate in a rotated narrow room', () => {
    const corners = [
      { x: -2, y: -0.6 },
      { x: 2, y: -0.6 },
      { x: 2, y: 0.6 },
      { x: -2, y: 0.6 },
    ];
    const boundary = analyzeRoomBoundary({
      vertices: corners.map((point) => rotatePoint(point, { x: 0, y: 0 }, 45)),
    })!;
    const candidates = calculateRotationCandidates(boundary, [member(-1.5, -0.4, 3, 0.8)]);
    expect(
      footprintFitsRoom(
        boundary,
        candidates.find((candidate) => candidate.rotation === 0)!,
        { x: 0, y: 0 },
      ),
    ).toBe(false);
    expect(
      footprintFitsRoom(
        boundary,
        candidates.find((candidate) => Math.abs(candidate.rotation - 45) < 1e-8)!,
        { x: 0, y: 0 },
      ),
    ).toBe(true);
  });
});
