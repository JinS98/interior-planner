import { describe, expect, it } from 'vitest';
import { resolveEditorShortcut } from './shortcuts';

const key = (code: string, patch: Partial<Parameters<typeof resolveEditorShortcut>[0]> = {}) => ({
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  isComposing: false,
  ...patch,
});

describe('resolveEditorShortcut', () => {
  it('maps tool, editing, and pan keys without modifiers', () => {
    expect(resolveEditorShortcut(key('KeyV'))).toEqual({ kind: 'tool', tool: 'select' });
    expect(resolveEditorShortcut(key('KeyR'))).toEqual({ kind: 'tool', tool: 'room' });
    expect(resolveEditorShortcut(key('KeyF'))).toEqual({ kind: 'tool', tool: 'object' });
    expect(resolveEditorShortcut(key('KeyD'))).toEqual({ kind: 'tool', tool: 'divide' });
    expect(resolveEditorShortcut(key('Escape'))).toBe('cancel');
    expect(resolveEditorShortcut(key('Delete'))).toBe('delete');
    expect(resolveEditorShortcut(key('Backspace'))).toBe('backspace');
    expect(resolveEditorShortcut(key('Space'))).toBe('pan');
  });

  it('maps undo and redo on Windows and macOS without treating modified letters as tools', () => {
    expect(resolveEditorShortcut(key('KeyZ', { ctrlKey: true }))).toBe('undo');
    expect(resolveEditorShortcut(key('KeyZ', { metaKey: true, shiftKey: true }))).toBe('redo');
    expect(resolveEditorShortcut(key('KeyY', { ctrlKey: true }))).toBe('redo');
    expect(resolveEditorShortcut(key('KeyC', { ctrlKey: true }))).toBe('copy');
    expect(resolveEditorShortcut(key('KeyV', { metaKey: true }))).toBe('paste');
    expect(resolveEditorShortcut(key('KeyR', { ctrlKey: true }))).toBeNull();
  });

  it('ignores repeats, composition, Alt, and unsupported Shift combinations', () => {
    expect(resolveEditorShortcut(key('KeyZ', { ctrlKey: true, repeat: true }))).toBeNull();
    expect(resolveEditorShortcut(key('KeyV', { isComposing: true }))).toBeNull();
    expect(resolveEditorShortcut(key('KeyV', { altKey: true }))).toBeNull();
    expect(resolveEditorShortcut(key('KeyV', { shiftKey: true }))).toBeNull();
    expect(resolveEditorShortcut(key('Space', { shiftKey: true }))).toBeNull();
  });
});
