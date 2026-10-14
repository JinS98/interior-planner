export const TOOL_SHORTCUTS = {
  select: 'V',
  room: 'R',
  object: 'F',
  divide: 'D',
} as const;

export type ShortcutAction =
  | { kind: 'tool'; tool: keyof typeof TOOL_SHORTCUTS }
  | 'undo'
  | 'redo'
  | 'copy'
  | 'paste'
  | 'delete'
  | 'backspace'
  | 'cancel'
  | 'pan';

type ShortcutKey = Pick<
  KeyboardEvent,
  'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'repeat' | 'isComposing'
>;

/** 키 조합을 편집 동작으로만 해석한다. 선택·도구별 실행 여부는 호출자가 결정한다. */
export function resolveEditorShortcut(event: ShortcutKey): ShortcutAction | null {
  if (event.repeat || event.isComposing || event.altKey) return null;
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier) {
    if (event.code === 'KeyZ') return event.shiftKey ? 'redo' : 'undo';
    if (event.code === 'KeyY' && !event.shiftKey) return 'redo';
    if (event.code === 'KeyC' && !event.shiftKey) return 'copy';
    if (event.code === 'KeyV' && !event.shiftKey) return 'paste';
    return null;
  }
  if (event.code === 'Escape') return 'cancel';
  if (event.code === 'Delete') return 'delete';
  if (event.code === 'Backspace') return 'backspace';
  if (event.code === 'Space' && !event.shiftKey) return 'pan';
  if (event.shiftKey) return null;
  const tool = (Object.keys(TOOL_SHORTCUTS) as Array<keyof typeof TOOL_SHORTCUTS>).find(
    (name) => event.code === `Key${TOOL_SHORTCUTS[name]}`,
  );
  return tool ? { kind: 'tool', tool } : null;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
    ) !== null
  );
}

export function isSpaceActivationTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('button, a[href], summary, [role="button"], [role="link"]') !== null
  );
}
