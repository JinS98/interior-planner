import { describe, expect, it } from 'vitest';
import { layoutObjectFromPaletteItem, createDefaultPaletteItems } from './catalog';
import { layoutObjectsFromSet, normalizeSetMembers, objectSetFootprint } from './setPresets';
import type { ObjectSetTemplate } from '../../types/layout';

describe('custom object sets', () => {
  it('keeps the arranged objects relative to the set center when placed elsewhere', () => {
    let index = 0;
    const [desk, chair] = createDefaultPaletteItems('project-1');
    const originals = [
      layoutObjectFromPaletteItem('builder', desk, { x: 2, y: 1 }, 'desk-1'),
      layoutObjectFromPaletteItem('builder', chair, { x: 2, y: 2 }, 'chair-1'),
    ];
    const members = normalizeSetMembers(originals)!;
    const template: ObjectSetTemplate = {
      id: 'my-set',
      projectId: 'project-1',
      name: '내 좌석',
      members,
    };
    const placed = layoutObjectsFromSet(
      template,
      'floor-1',
      { x: 8, y: 5 },
      () => `object-${index++}`,
    );
    expect(placed.map((object) => object.name)).toEqual(['책상', '의자']);
    expect(placed.map((object) => object.id)).toEqual(['object-1', 'object-2']);
    expect(placed.map((object) => object.groupId)).toEqual(['object-0', 'object-0']);
    expect(placed.map((object) => object.groupTemplateId)).toEqual(['my-set', 'my-set']);
    expect(placed[1].y - placed[0].y).toBeCloseTo(originals[1].y - originals[0].y);
    expect(placed[0].floorId).toBe('floor-1');
    expect(objectSetFootprint(template)).toEqual({ width: 1, height: 1.5 });
    expect(members[0]).not.toHaveProperty('id');
  });

  it('rejects an empty set and invalid dimensions', () => {
    const [desk] = createDefaultPaletteItems('project-1');
    const object = layoutObjectFromPaletteItem('builder', desk, { x: 0, y: 0 }, 'desk-1');
    expect(normalizeSetMembers([])).toBeNull();
    expect(normalizeSetMembers([{ ...object, width: 0 }])).toBeNull();
  });
});
