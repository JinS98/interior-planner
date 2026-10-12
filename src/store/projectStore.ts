import { create } from 'zustand';
import { validatePolygon } from '../domain/geometry/polygonValidation';
import type { RoomEditError } from '../features/room/edit';
import type { Floor, LayoutObject, Point, Project, Room } from '../types/layout';

export const LOCAL_PROJECT_ID = 'local-project';
export const LOCAL_FLOOR_ID = 'local-floor-1';

const initialProject: Project = {
  id: LOCAL_PROJECT_ID,
  ownerId: 'local',
  name: '제목 없는 프로젝트',
  purpose: 'other',
  targetAreaSqm: null,
  floorIds: [LOCAL_FLOOR_ID],
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
};

const initialFloor: Floor = {
  id: LOCAL_FLOOR_ID,
  projectId: LOCAL_PROJECT_ID,
  name: '1F',
  roomIds: [],
  objectIds: [],
};

export interface ProjectState {
  projectsById: Record<string, Project>;
  floorsById: Record<string, Floor>;
  roomsById: Record<string, Room>;
  objectsById: Record<string, LayoutObject>;
  replaceProjectData: (
    data: Pick<ProjectState, 'projectsById' | 'floorsById' | 'roomsById' | 'objectsById'>,
  ) => void;
  createRoom: (floorId: string, vertices: Point[]) => boolean;
  updateRoomVertices: (roomId: string, vertices: Point[]) => RoomEditError | null;
  setTargetAreaSqm: (projectId: string, targetAreaSqm: number | null) => void;
}

/** 향후 Firestore 저장 스냅샷의 원본. 그리기 중인 점은 여기에 넣지 않는다. */
export const useProjectStore = create<ProjectState>((set) => ({
  projectsById: { [LOCAL_PROJECT_ID]: initialProject },
  floorsById: { [LOCAL_FLOOR_ID]: initialFloor },
  roomsById: {},
  objectsById: {},
  replaceProjectData: (data) => set(data),
  createRoom: (floorId, vertices) => {
    if (validatePolygon(vertices)) return false;
    let created = false;
    set((state) => {
      const floor = state.floorsById[floorId];
      const project = floor && state.projectsById[floor.projectId];
      if (!floor || !project) return state;

      const room: Room = {
        id: crypto.randomUUID(),
        floorId,
        name: `공간 ${floor.roomIds.length + 1}`,
        vertices: vertices.map((point) => ({ ...point })),
      };
      created = true;
      return {
        projectsById: {
          ...state.projectsById,
          [project.id]: { ...project, updatedAt: new Date().toISOString() },
        },
        floorsById: {
          ...state.floorsById,
          [floorId]: { ...floor, roomIds: [...floor.roomIds, room.id] },
        },
        roomsById: { ...state.roomsById, [room.id]: room },
      };
    });
    return created;
  },
  updateRoomVertices: (roomId, vertices) => {
    const validationError = validatePolygon(vertices);
    if (validationError) return validationError;
    let found = false;
    set((state) => {
      const room = state.roomsById[roomId];
      const floor = room && state.floorsById[room.floorId];
      const project = floor && state.projectsById[floor.projectId];
      if (!room || !floor || !project) return state;
      found = true;
      if (
        room.vertices.length === vertices.length &&
        room.vertices.every(
          (vertex, index) => vertex.x === vertices[index].x && vertex.y === vertices[index].y,
        )
      ) {
        return state;
      }
      return {
        projectsById: {
          ...state.projectsById,
          [project.id]: { ...project, updatedAt: new Date().toISOString() },
        },
        roomsById: {
          ...state.roomsById,
          [roomId]: { ...room, vertices: vertices.map((vertex) => ({ ...vertex })) },
        },
      };
    });
    return found ? null : 'room-not-found';
  },
  setTargetAreaSqm: (projectId, targetAreaSqm) => {
    if (targetAreaSqm !== null && (!Number.isFinite(targetAreaSqm) || targetAreaSqm <= 0)) return;
    set((state) => {
      const project = state.projectsById[projectId];
      if (!project || project.targetAreaSqm === targetAreaSqm) return state;
      return {
        projectsById: {
          ...state.projectsById,
          [projectId]: { ...project, targetAreaSqm, updatedAt: new Date().toISOString() },
        },
      };
    });
  },
}));
