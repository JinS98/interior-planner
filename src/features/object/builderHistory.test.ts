import { describe, expect, it } from 'vitest';
import { createDefaultPaletteItems, layoutObjectFromPaletteItem } from './catalog';
import {
  commitBuilderEdit,
  EMPTY_BUILDER_HISTORY,
  finishBuilderGesture,
  previewBuilderEdit,
  redoBuilderEdit,
  undoBuilderEdit,
} from './builderHistory';

describe('set builder history', () => {
  const [desk, chair] = createDefaultPaletteItems('project');
  const first = layoutObjectFromPaletteItem('builder', desk, { x: 0, y: 0 }, 'desk');
  const second = layoutObjectFromPaletteItem('builder', chair, { x: 1, y: 0 }, 'chair');

  it('undoes deletion and restores it with redo', () => {
    const placed = commitBuilderEdit(EMPTY_BUILDER_HISTORY, [first, second]);
    const removed = commitBuilderEdit(placed, [first]);
    expect(undoBuilderEdit(removed).present).toEqual([first, second]);
    expect(redoBuilderEdit(undoBuilderEdit(removed)).present).toEqual([first]);
  });

  it('records an entire drag once and clears redo after a new edit', () => {
    const placed = commitBuilderEdit(EMPTY_BUILDER_HISTORY, [first]);
    const preview = previewBuilderEdit(placed, [{ ...first, x: 2 }]);
    const moved = finishBuilderGesture(preview, placed.present);
    expect(moved.past).toHaveLength(2);
    const undone = undoBuilderEdit(moved);
    expect(undone.present[0].x).toBe(first.x);
    expect(commitBuilderEdit(undone, [first, second]).future).toEqual([]);
  });
});
