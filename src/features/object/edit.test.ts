import { describe, expect, it } from 'vitest';
import type { Viewport } from '../../types/layout';
import { layoutObjectFromPreset } from './catalog';
import {
  objectCenter,
  resizeObjectFromScreenDrag,
  rotateObjectFromScreenDrag,
  rotatePoint,
  translateObjectFromScreenDrag,
} from './edit';

describe('resizeObjectFromScreenDrag', () => {
  const object = layoutObjectFromPreset('floor-1', 'desk', { x: 3, y: 2 }, 'desk-1');
  const viewport: Viewport = { x: 45, y: -30, scale: 160 };

  it('converts screen drag to meter dimensions while keeping the top-left fixed', () => {
    const next = resizeObjectFromScreenDrag(
      object,
      { x: 100, y: 100 },
      { x: 180, y: 132 },
      viewport,
    );
    expect(next).toMatchObject({
      x: object.x,
      y: object.y,
      width: 1.9,
      color: object.color,
      shape: object.shape,
    });
    expect(next.height).toBeCloseTo(0.9);
  });

  it('clamps the smallest and largest allowed sizes', () => {
    const small = resizeObjectFromScreenDrag(
      object,
      { x: 100, y: 100 },
      { x: -1000, y: -1000 },
      viewport,
    );
    expect(small.width).toBe(0.1);
    expect(small.height).toBe(0.1);
    const large = resizeObjectFromScreenDrag(
      object,
      { x: 100, y: 100 },
      { x: 10000, y: 10000 },
      viewport,
    );
    expect(large.width).toBe(20);
    expect(large.height).toBe(20);
  });
});

describe('moving and rotating objects', () => {
  const object = layoutObjectFromPreset('floor-1', 'desk', { x: 3, y: 2 }, 'desk-1');
  const viewport: Viewport = { x: 45, y: -30, scale: 160 };

  it('converts the screen drag to meters without changing dimensions', () => {
    const moved = translateObjectFromScreenDrag(
      object,
      { x: 100, y: 100 },
      { x: 180, y: 68 },
      viewport,
    );
    expect(moved.x).toBeCloseTo(object.x + 0.5);
    expect(moved.y).toBeCloseTo(object.y - 0.2);
    expect(moved.width).toBe(object.width);
  });

  it('uses pixels per meter while remaining independent of viewport pan', () => {
    const start = { x: 100, y: 100 };
    const end = { x: 180, y: 60 };
    const normal = translateObjectFromScreenDrag(object, start, end, { x: 0, y: 0, scale: 80 });
    const zoomed = translateObjectFromScreenDrag(object, start, end, {
      x: 250,
      y: -140,
      scale: 160,
    });
    const panned = translateObjectFromScreenDrag(object, start, end, {
      x: -400,
      y: 300,
      scale: 80,
    });
    expect(normal.x - object.x).toBeCloseTo(1);
    expect(normal.y - object.y).toBeCloseTo(-0.5);
    expect(zoomed.x - object.x).toBeCloseTo(0.5);
    expect(zoomed.y - object.y).toBeCloseTo(-0.25);
    expect(panned.x).toBeCloseTo(normal.x);
    expect(panned.y).toBeCloseTo(normal.y);
  });

  it('rotates around the center and normalizes the angle', () => {
    const center = objectCenter(object);
    const screenCenter = {
      x: center.x * viewport.scale + viewport.x,
      y: center.y * viewport.scale + viewport.y,
    };
    const rotated = rotateObjectFromScreenDrag(
      { ...object, rotation: 350 },
      { x: screenCenter.x, y: screenCenter.y - 30 },
      { x: screenCenter.x + 30, y: screenCenter.y },
      viewport,
    );
    expect(rotated.rotation).toBe(80);
    expect(objectCenter(rotated)).toEqual(center);
  });

  it('keeps the opposite corner fixed while resizing a rotated object', () => {
    const original = { ...object, rotation: 90 };
    const fixed = rotatePoint({ x: original.x, y: original.y }, objectCenter(original), 90);
    const resized = resizeObjectFromScreenDrag(
      original,
      { x: 100, y: 100 },
      { x: 100, y: 260 },
      viewport,
    );
    const fixedAfter = rotatePoint({ x: resized.x, y: resized.y }, objectCenter(resized), 90);
    expect(resized.width).toBeCloseTo(original.width + 1);
    expect(resized.height).toBeCloseTo(original.height);
    expect(fixedAfter.x).toBeCloseTo(fixed.x);
    expect(fixedAfter.y).toBeCloseTo(fixed.y);
  });
});
