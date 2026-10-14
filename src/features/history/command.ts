import type { Floor, LayoutObject, PaletteItem, Project, Room } from '../../types/layout';

/** 저장 대상 데이터만 담는다. 선택, Viewport, 드래그 미리보기는 제외한다. */
export interface ProjectSnapshot {
  projectsById: Record<string, Project>;
  floorsById: Record<string, Floor>;
  roomsById: Record<string, Room>;
  objectsById: Record<string, LayoutObject>;
  paletteItemsById: Record<string, PaletteItem>;
}

export interface EditCommand {
  label: string;
  before: ProjectSnapshot;
  after: ProjectSnapshot;
}

export const HISTORY_LIMIT = 100;

export function projectSnapshot(data: ProjectSnapshot): ProjectSnapshot {
  return {
    projectsById: data.projectsById,
    floorsById: data.floorsById,
    roomsById: data.roomsById,
    objectsById: data.objectsById,
    paletteItemsById: data.paletteItemsById,
  };
}
