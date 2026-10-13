import { create } from 'zustand';
import { validatePolygon } from '../domain/geometry/polygonValidation';
import { splitPolygon } from '../domain/geometry/polygonSplit';
import {
  createDefaultPaletteItems,
  isValidObjectAppearance,
  layoutObjectFromPaletteItem,
} from '../features/object/catalog';
import { normalizeObjectRotation } from '../features/object/edit';
import type { RoomEditError } from '../features/room/edit';
import type {
  Floor,
  LayoutObject,
  ObjectAppearance,
  PaletteItem,
  Point,
  Project,
  Room,
} from '../types/layout';

export const LOCAL_PROJECT_ID = 'local-project';
export const LOCAL_FLOOR_ID = 'local-floor-1';
const defaultPaletteItems = createDefaultPaletteItems(LOCAL_PROJECT_ID);

const initialProject: Project = {
  id: LOCAL_PROJECT_ID,
  ownerId: 'local',
  name: '제목 없는 프로젝트',
  purpose: 'other',
  targetAreaSqm: null,
  floorIds: [LOCAL_FLOOR_ID],
  paletteItemIds: defaultPaletteItems.map((item) => item.id),
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
  paletteItemsById: Record<string, PaletteItem>;
  replaceProjectData: (
    data: Pick<
      ProjectState,
      'projectsById' | 'floorsById' | 'roomsById' | 'objectsById' | 'paletteItemsById'
    >,
  ) => void;
  addPaletteItem: (
    projectId: string,
    input: Pick<PaletteItem, 'name' | 'category' | 'width' | 'height' | 'color' | 'shape'>,
  ) => PaletteItem | null;
  createRoom: (floorId: string, vertices: Point[]) => boolean;
  createLayoutObject: (
    floorId: string,
    paletteItemId: string,
    center: Point,
    appearance?: ObjectAppearance,
  ) => boolean;
  updateLayoutObject: (
    objectId: string,
    patch: Partial<
      Pick<LayoutObject, 'x' | 'y' | 'width' | 'height' | 'color' | 'shape' | 'rotation'>
    >,
  ) => boolean;
  deleteLayoutObject: (objectId: string) => boolean;
  splitRoom: (roomId: string, path: Point[]) => boolean;
  updateRoomVertices: (roomId: string, vertices: Point[]) => RoomEditError | null;
  setTargetAreaSqm: (projectId: string, targetAreaSqm: number | null) => void;
}

/** 향후 Firestore 저장 스냅샷의 원본. 그리기 중인 점은 여기에 넣지 않는다. */
export const useProjectStore = create<ProjectState>((set) => ({
  projectsById: { [LOCAL_PROJECT_ID]: initialProject },
  floorsById: { [LOCAL_FLOOR_ID]: initialFloor },
  roomsById: {},
  objectsById: {},
  paletteItemsById: Object.fromEntries(defaultPaletteItems.map((item) => [item.id, item])),
  replaceProjectData: (data) => set(data),
  addPaletteItem: (projectId, input) => {
    const name = input.name.trim();
    if (
      !name ||
      name.length > 40 ||
      !['furniture', 'electronics', 'facility', 'commercial'].includes(input.category) ||
      !isValidObjectAppearance(input)
    )
      return null;
    let created: PaletteItem | null = null;
    set((state) => {
      const project = state.projectsById[projectId];
      if (!project) return state;
      const item: PaletteItem = {
        ...input,
        id: crypto.randomUUID(),
        projectId,
        name,
        builtIn: false,
      };
      created = item;
      return {
        projectsById: {
          ...state.projectsById,
          [projectId]: {
            ...project,
            paletteItemIds: [...project.paletteItemIds, item.id],
            updatedAt: new Date().toISOString(),
          },
        },
        paletteItemsById: { ...state.paletteItemsById, [item.id]: item },
      };
    });
    return created;
  },
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
  createLayoutObject: (floorId, paletteItemId, center, appearance) => {
    if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return false;
    let created = false;
    set((state) => {
      const floor = state.floorsById[floorId];
      const project = floor && state.projectsById[floor.projectId];
      const item = state.paletteItemsById[paletteItemId];
      if (!floor || !project || !item || item.projectId !== project.id) return state;
      const selectedAppearance = appearance ?? item;
      if (!isValidObjectAppearance(selectedAppearance)) return state;
      const object = layoutObjectFromPaletteItem(
        floorId,
        item,
        center,
        crypto.randomUUID(),
        selectedAppearance,
      );
      created = true;
      return {
        projectsById: {
          ...state.projectsById,
          [project.id]: { ...project, updatedAt: new Date().toISOString() },
        },
        floorsById: {
          ...state.floorsById,
          [floorId]: { ...floor, objectIds: [...floor.objectIds, object.id] },
        },
        objectsById: { ...state.objectsById, [object.id]: object },
      };
    });
    return created;
  },
  updateLayoutObject: (objectId, patch) => {
    let updated = false;
    set((state) => {
      const object = state.objectsById[objectId];
      const floor = object && state.floorsById[object.floorId];
      const project = floor && state.projectsById[floor.projectId];
      if (!object || !project) return state;
      const appearance = {
        width: patch.width ?? object.width,
        height: patch.height ?? object.height,
        color: patch.color ?? object.color,
        shape: patch.shape ?? object.shape,
      };
      const x = patch.x ?? object.x;
      const y = patch.y ?? object.y;
      const rotation = patch.rotation ?? object.rotation;
      if (
        !isValidObjectAppearance(appearance) ||
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(rotation)
      )
        return state;
      const next = { ...object, ...appearance, x, y, rotation: normalizeObjectRotation(rotation) };
      updated = true;
      if (
        next.x === object.x &&
        next.y === object.y &&
        next.width === object.width &&
        next.height === object.height &&
        next.color === object.color &&
        next.shape === object.shape &&
        next.rotation === object.rotation
      )
        return state;
      return {
        projectsById: {
          ...state.projectsById,
          [project.id]: { ...project, updatedAt: new Date().toISOString() },
        },
        objectsById: { ...state.objectsById, [objectId]: next },
      };
    });
    return updated;
  },
  deleteLayoutObject: (objectId) => {
    let deleted = false;
    set((state) => {
      const object = state.objectsById[objectId];
      const floor = object && state.floorsById[object.floorId];
      const project = floor && state.projectsById[floor.projectId];
      if (!object || !floor || !project) return state;
      const objectsById = { ...state.objectsById };
      delete objectsById[objectId];
      deleted = true;
      return {
        projectsById: {
          ...state.projectsById,
          [project.id]: { ...project, updatedAt: new Date().toISOString() },
        },
        floorsById: {
          ...state.floorsById,
          [floor.id]: { ...floor, objectIds: floor.objectIds.filter((id) => id !== objectId) },
        },
        objectsById,
      };
    });
    return deleted;
  },
  splitRoom: (roomId, path) => {
    let divided = false;
    set((state) => {
      const room = state.roomsById[roomId];
      const floor = room && state.floorsById[room.floorId];
      const project = floor && state.projectsById[floor.projectId];
      if (!room || !floor || !project) return state;
      const parts = splitPolygon(room.vertices, path);
      if (!parts) return state;

      const newRoom: Room = {
        id: crypto.randomUUID(),
        floorId: floor.id,
        name: `공간 ${floor.roomIds.length + 1}`,
        vertices: parts[1].map((point) => ({ ...point })),
      };
      divided = true;
      return {
        projectsById: {
          ...state.projectsById,
          [project.id]: { ...project, updatedAt: new Date().toISOString() },
        },
        floorsById: {
          ...state.floorsById,
          [floor.id]: { ...floor, roomIds: [...floor.roomIds, newRoom.id] },
        },
        roomsById: {
          ...state.roomsById,
          [roomId]: { ...room, vertices: parts[0].map((point) => ({ ...point })) },
          [newRoom.id]: newRoom,
        },
      };
    });
    return divided;
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
