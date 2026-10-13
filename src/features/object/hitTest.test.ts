import { describe, expect, it } from 'vitest';
import type { Viewport } from '../../types/layout';
import { layoutObjectFromPaletteItem, layoutObjectFromPreset } from './catalog';
import {
  hitTestLayoutObject,
  isNearObjectResizeHandle,
  isNearObjectRotationHandle,
  objectResizeHandlePoint,
  objectRotationHandlePoint,
} from './hitTest';

const viewport: Viewport = { x: 0, y: 0, scale: 80 };

describe('object hit testing', () => {
  it('selects the visible circle and triangle but skips their empty corners', () => {
    const circle = layoutObjectFromPreset('floor-1', 'chair', { x: 1, y: 1 }, 'chair');
    const triangle = layoutObjectFromPaletteItem(
      'floor-1',
      {
        id: 'pc',
        projectId: 'project-1',
        name: 'PC',
        category: 'electronics',
        width: 1,
        height: 1,
        color: '#123456',
        shape: 'triangle',
        builtIn: false,
      },
      { x: 3, y: 1 },
      'pc',
      {
        width: 1,
        height: 1,
        color: '#123456',
        shape: 'triangle',
      },
    );
    expect(hitTestLayoutObject([circle], { x: 80, y: 80 }, viewport)?.id).toBe('chair');
    expect(hitTestLayoutObject([circle], { x: 57, y: 57 }, viewport)).toBeNull();
    expect(hitTestLayoutObject([triangle], { x: 240, y: 80 }, viewport)?.id).toBe('pc');
    expect(hitTestLayoutObject([triangle], { x: 201, y: 41 }, viewport)).toBeNull();
  });

  it('detects the selected object resize handle in screen pixels', () => {
    const object = layoutObjectFromPreset('floor-1', 'desk', { x: 1, y: 1 }, 'desk');
    expect(isNearObjectResizeHandle(object, { x: 136, y: 108 }, viewport)).toBe(true);
    expect(isNearObjectResizeHandle(object, { x: 100, y: 80 }, viewport)).toBe(false);
  });

  it('hit tests the rotated shape and rotated edit handles', () => {
    const object = {
      ...layoutObjectFromPreset('floor-1', 'desk', { x: 2, y: 2 }, 'desk'),
      rotation: 90,
    };
    expect(hitTestLayoutObject([object], { x: 160, y: 110 }, viewport)?.id).toBe('desk');
    expect(hitTestLayoutObject([object], { x: 210, y: 160 }, viewport)).toBeNull();
    expect(
      isNearObjectResizeHandle(object, objectResizeHandlePoint(object, viewport), viewport),
    ).toBe(true);
    expect(
      isNearObjectRotationHandle(object, objectRotationHandlePoint(object, viewport), viewport),
    ).toBe(true);
  });
});
