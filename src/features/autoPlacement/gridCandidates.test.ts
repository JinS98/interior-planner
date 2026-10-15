import { describe, expect, it } from 'vitest';
import type { LayoutObject, ObjectSetMember, Point, Room } from '../../types/layout';
import { analyzeRoomBoundary, calculateRotationCandidates } from './geometry';
import {
  candidateHasClearance,
  generateGridCandidates,
  selectCompatibleCandidates,
} from './gridCandidates';

const room: Room = {
  id: 'room',
  floorId: 'floor',
  name: '공간',
  vertices: [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 6 },
    { x: 0, y: 6 },
  ],
};

function member(width = 1, height = 1): ObjectSetMember {
  return {
    category: 'furniture',
    type: 'desk',
    name: '책상',
    x: -width / 2,
    y: -height / 2,
    width,
    height,
    color: '#123456',
    shape: 'rectangle',
    rotation: 0,
  };
}

function object(x: number, y: number, width = 1, height = 1, rotation = 0): LayoutObject {
  return {
    ...member(width, height),
    id: `object-${x}-${y}`,
    floorId: room.floorId,
    x,
    y,
    rotation,
    locked: false,
  };
}

function hasCenter(candidates: { center: Point; rotation: number }[], x: number, y: number) {
  return candidates.some(
    (candidate) => candidate.rotation === 0 && candidate.center.x === x && candidate.center.y === y,
  );
}

describe('grid based automatic placement candidates', () => {
  it('uses a deterministic World grid and returns only fully contained footprints', () => {
    const result = generateGridCandidates(room, [member()], [], {
      gridStepMeters: 1,
      minimumAisleWidthMeters: 0,
    });
    expect(result.error).toBeNull();
    expect(result.truncated).toBe(false);
    expect(result.candidates).toHaveLength(100);
    expect(hasCenter(result.candidates, 1, 1)).toBe(true);
    expect(hasCenter(result.candidates, 0, 1)).toBe(false);
    expect(result.candidates[0]).toMatchObject({
      roomId: room.id,
      floorId: room.floorId,
      center: { x: 1, y: 1 },
      rotation: 0,
    });
  });

  it('rejects overlap and enforces the configured aisle gap to existing objects', () => {
    const obstacle = object(2.5, 2.5);
    const touching = generateGridCandidates(room, [member()], [obstacle], {
      gridStepMeters: 1,
      minimumAisleWidthMeters: 0,
    });
    const aisle = generateGridCandidates(room, [member()], [obstacle], {
      gridStepMeters: 1,
      minimumAisleWidthMeters: 1,
    });
    expect(hasCenter(touching.candidates, 3, 3)).toBe(false);
    expect(hasCenter(touching.candidates, 2, 3)).toBe(true);
    expect(hasCenter(aisle.candidates, 2, 3)).toBe(false);
    expect(hasCenter(aisle.candidates, 1, 3)).toBe(true);
    expect(aisle.candidates.length).toBeLessThan(touching.candidates.length);
  });

  it('can keep wall clearance separate from the aisle width', () => {
    const boundaryRoom = {
      ...room,
      vertices: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ],
    };
    const touchingWall = generateGridCandidates(boundaryRoom, [member()], [], {
      gridStepMeters: 1,
      minimumAisleWidthMeters: 1,
    });
    const awayFromWall = generateGridCandidates(boundaryRoom, [member()], [], {
      gridStepMeters: 1,
      minimumAisleWidthMeters: 1,
      wallClearanceMeters: 0.75,
    });
    expect(hasCenter(touchingWall.candidates, 1, 1)).toBe(true);
    expect(hasCenter(awayFromWall.candidates, 1, 1)).toBe(false);
    expect(hasCenter(awayFromWall.candidates, 2, 2)).toBe(true);
  });

  it('uses rotated outlines rather than axis aligned bounds for obstacle collision', () => {
    const boundary = analyzeRoomBoundary(room)!;
    const small = calculateRotationCandidates(boundary, [member(0.2, 0.2)])[0];
    const diamond = [
      { x: 2, y: 2 - Math.SQRT1_2 },
      { x: 2 + Math.SQRT1_2, y: 2 },
      { x: 2, y: 2 + Math.SQRT1_2 },
      { x: 2 - Math.SQRT1_2, y: 2 },
    ];
    expect(candidateHasClearance(small, { x: 2.3, y: 2.3 }, [diamond], 0)).toBe(false);
    expect(candidateHasClearance(small, { x: 2.6, y: 2.6 }, [diamond], 0)).toBe(true);
    expect(candidateHasClearance(small, { x: 2.6, y: 2.6 }, [diamond], 0.25)).toBe(false);
  });

  it('filters out other floors and bounds the work for invalid or overly dense grids', () => {
    const otherFloorObject = { ...object(2.5, 2.5), floorId: 'other-floor' };
    const limited = generateGridCandidates(room, [member()], [otherFloorObject], {
      gridStepMeters: 1,
      minimumAisleWidthMeters: 0,
      maxCandidates: 3,
    });
    expect(limited).toMatchObject({ error: null, truncated: true });
    expect(limited.candidates).toHaveLength(3);
    expect(
      generateGridCandidates(room, [member()], [], {
        gridStepMeters: 0,
        minimumAisleWidthMeters: 0,
      }).error,
    ).toBe('invalid-options');
    expect(
      generateGridCandidates(room, [member()], [], {
        gridStepMeters: 0.001,
        minimumAisleWidthMeters: 0,
      }).error,
    ).toBe('grid-too-dense');
    expect(
      generateGridCandidates({ ...room, vertices: [] }, [member()], [], {
        gridStepMeters: 1,
        minimumAisleWidthMeters: 0,
      }).error,
    ).toBe('invalid-geometry');
  });

  it('picks a collision-free subset with aisle width between newly placed sets', () => {
    const { candidates } = generateGridCandidates(room, [member()], [], {
      gridStepMeters: 1,
      minimumAisleWidthMeters: 0,
      maxCandidates: 200,
    });
    const selected = selectCompatibleCandidates(candidates, [], 1, 20);
    expect(
      selectCompatibleCandidates(
        candidates,
        [{ ...object(0.5, 0.5), floorId: 'other-floor' }],
        1,
        20,
      ),
    ).toEqual(selected);
    expect(selected.length).toBeGreaterThan(1);
    expect(selected.length).toBeLessThan(candidates.length);
    expect(
      selected.filter((candidate) => candidate.center.x === 1 && candidate.center.y === 1),
    ).toHaveLength(1);
    for (let first = 0; first < selected.length; first += 1) {
      const obstacle = selected[first].members.flatMap((member) =>
        member.corners.map((point) => ({
          x: point.x + selected[first].center.x,
          y: point.y + selected[first].center.y,
        })),
      );
      for (let second = first + 1; second < selected.length; second += 1) {
        expect(
          candidateHasClearance(selected[second], selected[second].center, [obstacle], 1),
        ).toBe(true);
      }
    }
  });

  it('covers the whole room before refining a dense grid', () => {
    const fine = generateGridCandidates(room, [member()], [], {
      gridStepMeters: 0.1,
      minimumAisleWidthMeters: 0.1,
      maxCandidates: 5_000,
    });
    const coarse = generateGridCandidates(room, [member()], [], {
      gridStepMeters: 0.2,
      minimumAisleWidthMeters: 0.1,
      maxCandidates: 5_000,
    });
    expect(fine.truncated).toBe(true);
    expect(fine.candidates.some((candidate) => candidate.center.y >= 5)).toBe(true);
    const finePlacements = selectCompatibleCandidates(fine.candidates, [], 0.1, 20);
    const coarsePlacements = selectCompatibleCandidates(coarse.candidates, [], 0.1, 20);
    expect(finePlacements.length).toBeGreaterThanOrEqual(coarsePlacements.length);
  });

  it('does not lose the lower half of a sloped room when the search grid is refined', () => {
    const slopedRoom: Room = {
      ...room,
      vertices: [
        { x: 0, y: 0 }, { x: 8, y: 2 }, { x: 8, y: 5 }, { x: 0, y: 5 },
      ],
    };
    const table = { ...member(1.4, 0.7), x: -0.7, y: -0.6 };
    const chair = { ...member(0.5, 0.5), x: -0.55, y: 0.25 };
    const secondChair = { ...chair, x: 0.55 };
    const members = [table, chair, secondChair];
    const fine = generateGridCandidates(slopedRoom, members, [], {
      gridStepMeters: 0.1, minimumAisleWidthMeters: 0.1, maxCandidates: 5_000,
    });
    const coarse = generateGridCandidates(slopedRoom, members, [], {
      gridStepMeters: 0.2, minimumAisleWidthMeters: 0.1, maxCandidates: 5_000,
    });
    expect(fine.error).toBeNull();
    expect(fine.candidates.some((candidate) => candidate.center.y >= 4)).toBe(true);
    expect(selectCompatibleCandidates(fine.candidates, [], 0.1, 13).length)
      .toBeGreaterThanOrEqual(selectCompatibleCandidates(coarse.candidates, [], 0.1, 13).length);
  });
});
