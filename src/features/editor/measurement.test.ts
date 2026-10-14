import { describe, expect, it } from 'vitest';
import { worldToScreen } from '../../domain/geometry/coordinates';
import type { LayoutObject, Room, Viewport } from '../../types/layout';
import { measureElements, measureHoveredElement } from './measurement';

const furniture = (id: string, patch: Partial<LayoutObject> = {}): LayoutObject => ({
  id,
  floorId: 'floor-1',
  category: 'furniture',
  type: 'desk',
  name: id,
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  color: '#D5A56D',
  shape: 'rectangle',
  rotation: 0,
  locked: false,
  ...patch,
});

const room = (vertices: Room['vertices']): Room => ({
  id: 'room-1',
  floorId: 'floor-1',
  name: 'Room',
  vertices,
});

describe('measureElements', () => {
  it('shows the shortest edge gap between two objects', () => {
    const result = measureElements(
      { kind: 'object', object: furniture('first') },
      { kind: 'object', object: furniture('second', { x: 2 }) },
    )!;
    expect(result.distanceMeters).toBeCloseTo(1);
    expect(result.start.x).toBeCloseTo(1);
    expect(result.end.x).toBeCloseTo(2);
    expect(result.start.y).toBeCloseTo(0.5);
    expect(result.end.y).toBeCloseTo(0.5);
  });

  it('uses a rotated object outline against a room wall', () => {
    const result = measureElements(
      {
        kind: 'object',
        object: furniture('rotated', { x: -0.5, y: -0.5, rotation: 45 }),
      },
      {
        kind: 'room',
        room: room([
          { x: 2, y: -2 },
          { x: 3, y: -2 },
          { x: 3, y: 2 },
          { x: 2, y: 2 },
        ]),
      },
    )!;
    expect(result.distanceMeters).toBeCloseTo(2 - Math.SQRT1_2);
  });

  it('shows clearance to the nearest wall when an object is inside a room', () => {
    const result = measureElements(
      { kind: 'object', object: furniture('inside', { x: 1, y: 1 }) },
      {
        kind: 'room',
        room: room([
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 4 },
          { x: 0, y: 4 },
        ]),
      },
    )!;
    expect(result.distanceMeters).toBeCloseTo(1);
  });

  it.each(['circle', 'triangle'] as const)('measures a %s outline', (shape) => {
    const result = measureElements(
      { kind: 'object', object: furniture(shape, { width: 2, height: 2, shape }) },
      {
        kind: 'room',
        room: room([
          { x: 3, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 2 },
          { x: 3, y: 2 },
        ]),
      },
    )!;
    expect(result.distanceMeters).toBeCloseTo(1, 1);
  });

  it('reports zero when boundaries cross', () => {
    const result = measureElements(
      { kind: 'object', object: furniture('first') },
      { kind: 'object', object: furniture('second', { x: 0.5 }) },
    )!;
    expect(result.distanceMeters).toBe(0);
  });

  it('uses the hovered object first and ignores the selected object itself', () => {
    const viewport: Viewport = { x: 30, y: 20, scale: 100 };
    const first = furniture('first');
    const second = furniture('second', { x: 2 });
    const outer = room([
      { x: -1, y: -1 },
      { x: 4, y: -1 },
      { x: 4, y: 2 },
      { x: -1, y: 2 },
    ]);
    const source = { kind: 'object' as const, object: first };
    expect(
      measureHoveredElement(
        source,
        [first, second],
        [outer],
        worldToScreen({ x: 0.5, y: 0.5 }, viewport),
        viewport,
      ),
    ).toBeNull();
    const hovered = measureHoveredElement(
      source,
      [first, second],
      [outer],
      worldToScreen({ x: 2.5, y: 0.5 }, viewport),
      viewport,
    );
    expect(hovered?.target.kind).toBe('object');
    expect(hovered?.measurement.distanceMeters).toBeCloseTo(1);
    const hoveredRoom = measureHoveredElement(
      source,
      [first, second],
      [outer],
      worldToScreen({ x: 3.5, y: 1.5 }, viewport),
      viewport,
    );
    expect(hoveredRoom?.target.kind).toBe('room');
    expect(hoveredRoom?.measurement.distanceMeters).toBeCloseTo(1);
  });

  it('measures between separate rooms when a room is selected', () => {
    const viewport: Viewport = { x: 0, y: 0, scale: 80 };
    const first = room([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]);
    const second = {
      ...room([
        { x: 3, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 2 },
        { x: 3, y: 2 },
      ]),
      id: 'room-2',
    };
    const result = measureHoveredElement(
      { kind: 'room', room: first },
      [],
      [first, second],
      worldToScreen({ x: 4, y: 1 }, viewport),
      viewport,
    );
    expect(result?.target.kind).toBe('room');
    expect(result?.measurement.distanceMeters).toBeCloseTo(1);
  });
});
