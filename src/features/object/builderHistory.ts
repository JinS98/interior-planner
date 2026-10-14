import type { LayoutObject } from '../../types/layout';

export interface BuilderHistory {
  present: LayoutObject[];
  past: LayoutObject[][];
  future: LayoutObject[][];
}

export const EMPTY_BUILDER_HISTORY: BuilderHistory = { present: [], past: [], future: [] };

function sameObjects(a: LayoutObject[], b: LayoutObject[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 배치·삭제·복제·속성 편집은 각각 한 번의 되돌리기 작업으로 기록한다. */
export function commitBuilderEdit(history: BuilderHistory, next: LayoutObject[]): BuilderHistory {
  if (sameObjects(history.present, next)) return history;
  return { present: next, past: [...history.past, history.present], future: [] };
}

/** 드래그 중에는 화면만 갱신하고, 종료 시 시작 상태를 한 번 기록한다. */
export function previewBuilderEdit(history: BuilderHistory, next: LayoutObject[]): BuilderHistory {
  return { ...history, present: next };
}

export function finishBuilderGesture(
  history: BuilderHistory,
  before: LayoutObject[],
): BuilderHistory {
  if (sameObjects(before, history.present)) return history;
  return { ...history, past: [...history.past, before], future: [] };
}

export function undoBuilderEdit(history: BuilderHistory): BuilderHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    present: previous,
    past: history.past.slice(0, -1),
    future: [...history.future, history.present],
  };
}

export function redoBuilderEdit(history: BuilderHistory): BuilderHistory {
  const next = history.future.at(-1);
  if (!next) return history;
  return {
    present: next,
    past: [...history.past, history.present],
    future: history.future.slice(0, -1),
  };
}
