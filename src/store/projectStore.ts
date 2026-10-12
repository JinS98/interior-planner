import { create } from 'zustand';
import type { Floor, LayoutObject, Project, Room } from '../types/layout';

export interface ProjectState {
  projectsById: Record<string, Project>;
  floorsById: Record<string, Floor>;
  roomsById: Record<string, Room>;
  objectsById: Record<string, LayoutObject>;
  replaceProjectData: (
    data: Pick<ProjectState, 'projectsById' | 'floorsById' | 'roomsById' | 'objectsById'>,
  ) => void;
}

/** 향후 Firestore 저장 스냅샷의 원본. 드래그 중 임시 좌표는 여기에 넣지 않는다. */
export const useProjectStore = create<ProjectState>((set) => ({
  projectsById: {},
  floorsById: {},
  roomsById: {},
  objectsById: {},
  replaceProjectData: (data) => set(data),
}));
