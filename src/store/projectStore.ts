import { create } from 'zustand';
import { validatePolygon } from '../domain/geometry/polygonValidation';
import { snapRightAngle } from '../domain/geometry/angles';
import { splitPolygon } from '../domain/geometry/polygonSplit';
import {
  createDefaultPaletteItems,
  isValidObjectAppearance,
  layoutObjectFromPaletteItem,
} from '../features/object/catalog';
import { isValidObjectArray, type ObjectArrayOptions } from '../features/object/array';
import {
  MAX_SET_PLACED_OBJECTS,
  layoutObjectsFromSet,
  normalizeSetMembers,
} from '../features/object/setPresets';
import { normalizeObjectRotation } from '../features/object/edit';
import { rotateGroupObjects } from '../features/object/group';
import {
  createAutoPlacementPlan,
  objectsFromAutoPlacements,
  sameAutoPlacements,
  type AutoPlacementOptions,
  type AutoPlacementSource,
  templateFromPaletteItem,
} from '../features/autoPlacement/plan';
import type { GridPlacementCandidate } from '../features/autoPlacement/gridCandidates';
import {
  connectedObjects,
  floorConnectionLinks,
  refreshFloorConnectionLinks,
} from '../features/floor/connection';
import { HISTORY_LIMIT, projectSnapshot, type EditCommand } from '../features/history/command';
import type { RoomEditError } from '../features/room/edit';
import type {
  Floor,
  LayoutObject,
  ObjectSetTemplate,
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
  setTemplateIds: [],
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
  setTemplatesById: Record<string, ObjectSetTemplate>;
  historyPast: EditCommand[];
  historyFuture: EditCommand[];
  undo: () => boolean;
  redo: () => boolean;
  replaceProjectData: (
    data: Pick<
      ProjectState,
      | 'projectsById'
      | 'floorsById'
      | 'roomsById'
      | 'objectsById'
      | 'paletteItemsById'
      | 'setTemplatesById'
    >,
  ) => void;
  createFloor: (
    projectId: string,
    options?: { sourceFloorId?: string; copyObjects?: boolean },
  ) => Floor | null;
  renameFloor: (floorId: string, name: string) => boolean;
  deleteFloor: (floorId: string) => boolean;
  addPaletteItem: (
    projectId: string,
    input: Pick<PaletteItem, 'name' | 'category' | 'width' | 'height' | 'color' | 'shape'> &
      Pick<PaletteItem, 'floorConnector'>,
  ) => PaletteItem | null;
  addSetTemplate: (
    projectId: string,
    name: string,
    objects: LayoutObject[],
  ) => ObjectSetTemplate | null;
  setPaletteItemFloorConnector: (itemId: string, floorConnector: boolean) => boolean;
  createRoom: (floorId: string, vertices: Point[]) => boolean;
  createLayoutObject: (
    floorId: string,
    paletteItemId: string,
    center: Point,
    appearance?: ObjectAppearance,
  ) => boolean;
  createLayoutObjectArray: (
    floorId: string,
    paletteItemId: string,
    centers: Point[],
    appearance: ObjectAppearance,
    options: ObjectArrayOptions,
  ) => boolean;
  createObjectSetArray: (
    floorId: string,
    setId: string,
    centers: Point[],
    options: ObjectArrayOptions,
  ) => boolean;
  applyAutoPlacements: (
    floorId: string,
    roomId: string,
    source: AutoPlacementSource,
    options: AutoPlacementOptions,
    previewPlacements: GridPlacementCandidate[],
  ) => boolean;
  updateLayoutObject: (
    objectId: string,
    patch: Partial<
      Pick<LayoutObject, 'x' | 'y' | 'width' | 'height' | 'color' | 'shape' | 'rotation'>
    >,
  ) => boolean;
  moveLayoutObjects: (objectIds: string[], delta: Point) => boolean;
  rotateLayoutObjectGroup: (groupId: string, degrees: number) => boolean;
  duplicateLayoutObjects: (
    floorId: string,
    sourceObjects: LayoutObject[],
    offset: Point,
  ) => string[];
  setLayoutObjectsLocked: (objectIds: string[], locked: boolean) => boolean;
  deleteLayoutObjects: (objectIds: string[]) => string[];
  deleteLayoutObject: (objectId: string) => boolean;
  splitRoom: (roomId: string, path: Point[]) => boolean;
  updateRoomVertices: (roomId: string, vertices: Point[]) => RoomEditError | null;
  setTargetAreaSqm: (projectId: string, targetAreaSqm: number | null) => void;
}

/** 향후 Firestore 저장 스냅샷의 원본. 그리기 중인 점은 여기에 넣지 않는다. */
export const useProjectStore = create<ProjectState>((set, get) => {
  const commit = (
    label: string,
    update: (state: ProjectState) => Partial<ProjectState> | ProjectState,
  ) =>
    set((state) => {
      const patch = update(state);
      if (patch === state) return state;
      const command: EditCommand = {
        label,
        before: projectSnapshot(state),
        after: projectSnapshot({ ...state, ...patch }),
      };
      return {
        ...patch,
        historyPast: [...state.historyPast, command].slice(-HISTORY_LIMIT),
        historyFuture: [],
      };
    });

  return {
    projectsById: { [LOCAL_PROJECT_ID]: initialProject },
    floorsById: { [LOCAL_FLOOR_ID]: initialFloor },
    roomsById: {},
    objectsById: {},
    paletteItemsById: Object.fromEntries(defaultPaletteItems.map((item) => [item.id, item])),
    setTemplatesById: {},
    historyPast: [],
    historyFuture: [],
    replaceProjectData: (data) => set({ ...data, historyPast: [], historyFuture: [] }),
    undo: () => {
      let undone = false;
      set((state) => {
        const command = state.historyPast.at(-1);
        if (!command) return state;
        undone = true;
        return {
          ...command.before,
          historyPast: state.historyPast.slice(0, -1),
          historyFuture: [...state.historyFuture, command],
        };
      });
      return undone;
    },
    redo: () => {
      let redone = false;
      set((state) => {
        const command = state.historyFuture.at(-1);
        if (!command) return state;
        redone = true;
        return {
          ...command.after,
          historyPast: [...state.historyPast, command],
          historyFuture: state.historyFuture.slice(0, -1),
        };
      });
      return redone;
    },
    createFloor: (projectId, options) => {
      let created: Floor | null = null;
      commit('층 추가', (state) => {
        const project = state.projectsById[projectId];
        if (!project) return state;
        const source = options?.sourceFloorId ? state.floorsById[options.sourceFloorId] : null;
        if (options?.sourceFloorId && (!source || source.projectId !== projectId)) return state;
        const existingNames = new Set(
          project.floorIds.map((id) => state.floorsById[id]?.name.toLowerCase()),
        );
        let number = 2;
        while (existingNames.has(`${number}f`)) number += 1;
        const floorId = crypto.randomUUID();
        const rooms = (source?.roomIds ?? [])
          .map((id) => state.roomsById[id])
          .filter((room) => room)
          .map((room) => ({
            ...room,
            id: crypto.randomUUID(),
            floorId,
            vertices: room.vertices.map((vertex) => ({ ...vertex })),
          }));
        const copiedGroupIds = new Map<string, string>();
        const copiedObjects = (options?.copyObjects ? (source?.objectIds ?? []) : [])
          .map((id) => state.objectsById[id])
          .filter((object) => object && !object.floorConnectionId)
          .map((object) => {
            if (object.groupId && !copiedGroupIds.has(object.groupId))
              copiedGroupIds.set(object.groupId, crypto.randomUUID());
            return {
              ...object,
              id: crypto.randomUUID(),
              floorId,
              ...(object.groupId ? { groupId: copiedGroupIds.get(object.groupId) } : {}),
            };
          });
        const seenConnections = new Set<string>();
        const connectedObjectsToCopy = project.floorIds
          .flatMap((id) => state.floorsById[id]?.objectIds ?? [])
          .map((id) => state.objectsById[id])
          .filter((object) => {
            if (!object?.floorConnectionId || seenConnections.has(object.floorConnectionId))
              return false;
            seenConnections.add(object.floorConnectionId);
            return true;
          })
          .map((object) => ({ ...object, id: crypto.randomUUID(), floorId }));
        const objects = [...copiedObjects, ...connectedObjectsToCopy];
        const nextProject: Project = {
          ...project,
          floorIds: [...project.floorIds, floorId],
          updatedAt: new Date().toISOString(),
        };
        const floor: Floor = {
          id: floorId,
          projectId,
          name: `${number}F`,
          roomIds: rooms.map((room) => room.id),
          objectIds: objects.map((object) => object.id),
        };
        created = floor;
        const floorsById = { ...state.floorsById, [floor.id]: floor };
        const objectsById = refreshFloorConnectionLinks(nextProject, floorsById, {
          ...state.objectsById,
          ...Object.fromEntries(objects.map((object) => [object.id, object])),
        });
        return {
          projectsById: {
            ...state.projectsById,
            [projectId]: nextProject,
          },
          floorsById,
          roomsById: {
            ...state.roomsById,
            ...Object.fromEntries(rooms.map((room) => [room.id, room])),
          },
          objectsById,
        };
      });
      return created;
    },
    renameFloor: (floorId, input) => {
      const name = input.trim();
      if (!name || name.length > 40) return false;
      let renamed = false;
      commit('층 이름 변경', (state) => {
        const floor = state.floorsById[floorId];
        const project = floor && state.projectsById[floor.projectId];
        if (!floor || !project) return state;
        if (
          project.floorIds.some(
            (id) =>
              id !== floorId && state.floorsById[id]?.name.toLowerCase() === name.toLowerCase(),
          )
        )
          return state;
        renamed = true;
        if (floor.name === name) return state;
        return {
          projectsById: {
            ...state.projectsById,
            [project.id]: { ...project, updatedAt: new Date().toISOString() },
          },
          floorsById: { ...state.floorsById, [floorId]: { ...floor, name } },
        };
      });
      return renamed;
    },
    deleteFloor: (floorId) => {
      let deleted = false;
      commit('층 삭제', (state) => {
        const floor = state.floorsById[floorId];
        const project = floor && state.projectsById[floor.projectId];
        if (
          !floor ||
          !project ||
          !project.floorIds.includes(floorId) ||
          project.floorIds.length <= 1
        )
          return state;
        const floorsById = { ...state.floorsById };
        delete floorsById[floorId];
        const nextProject: Project = {
          ...project,
          floorIds: project.floorIds.filter((id) => id !== floorId),
          updatedAt: new Date().toISOString(),
        };
        deleted = true;
        return {
          projectsById: {
            ...state.projectsById,
            [project.id]: nextProject,
          },
          floorsById,
          roomsById: Object.fromEntries(
            Object.entries(state.roomsById).filter(([, room]) => room.floorId !== floorId),
          ),
          objectsById: refreshFloorConnectionLinks(
            nextProject,
            floorsById,
            Object.fromEntries(
              Object.entries(state.objectsById).filter(([, object]) => object.floorId !== floorId),
            ),
          ),
        };
      });
      return deleted;
    },
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
      commit('물품 팔레트 추가', (state) => {
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
    addSetTemplate: (projectId, name, objects) => {
      const trimmedName = name.trim();
      const members = normalizeSetMembers(objects);
      if (!trimmedName || trimmedName.length > 40 || !members) return null;
      let created: ObjectSetTemplate | null = null;
      commit('내 세트 만들기', (state) => {
        const project = state.projectsById[projectId];
        if (!project) return state;
        const template: ObjectSetTemplate = {
          id: crypto.randomUUID(),
          projectId,
          name: trimmedName,
          members,
        };
        created = template;
        return {
          projectsById: {
            ...state.projectsById,
            [projectId]: {
              ...project,
              setTemplateIds: [...project.setTemplateIds, template.id],
              updatedAt: new Date().toISOString(),
            },
          },
          setTemplatesById: { ...state.setTemplatesById, [template.id]: template },
        };
      });
      return created;
    },
    setPaletteItemFloorConnector: (itemId, floorConnector) => {
      let updated = false;
      commit('물품 층 연결 설정', (state) => {
        const item = state.paletteItemsById[itemId];
        const project = item && state.projectsById[item.projectId];
        if (!item || !project || !project.paletteItemIds.includes(itemId)) return state;
        updated = true;
        if (Boolean(item.floorConnector) === floorConnector) return state;
        return {
          projectsById: {
            ...state.projectsById,
            [project.id]: { ...project, updatedAt: new Date().toISOString() },
          },
          paletteItemsById: {
            ...state.paletteItemsById,
            [itemId]: { ...item, floorConnector },
          },
        };
      });
      return updated;
    },
    createRoom: (floorId, vertices) => {
      if (validatePolygon(vertices)) return false;
      let created = false;
      commit('공간 생성', (state) => {
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
      const item = get().paletteItemsById[paletteItemId];
      if (!item) return false;
      return get().createLayoutObjectArray(floorId, paletteItemId, [center], appearance ?? item, {
        columns: 1,
        rows: 1,
        gapX: 0,
        gapY: 0,
      });
    },
    createLayoutObjectArray: (floorId, paletteItemId, centers, appearance, options) => {
      if (
        !isValidObjectArray(options) ||
        centers.length !== options.columns * options.rows ||
        centers.some((center) => !Number.isFinite(center.x) || !Number.isFinite(center.y))
      )
        return false;
      let created = false;
      commit(centers.length > 1 ? '물품 배열 배치' : '물품 배치', (state) => {
        const floor = state.floorsById[floorId];
        const project = floor && state.projectsById[floor.projectId];
        const item = state.paletteItemsById[paletteItemId];
        if (!floor || !project || !item || item.projectId !== project.id) return state;
        if (!isValidObjectAppearance(appearance)) return state;
        const objects = centers.flatMap((center) => {
          const connectionId = item.floorConnector ? crypto.randomUUID() : null;
          const targetFloorIds = connectionId ? project.floorIds : [floorId];
          return targetFloorIds.map((targetFloorId) => ({
            ...layoutObjectFromPaletteItem(
              targetFloorId,
              item,
              center,
              crypto.randomUUID(),
              appearance,
            ),
            ...(connectionId
              ? { floorConnectionId: connectionId, ...floorConnectionLinks(project, targetFloorId) }
              : {}),
          }));
        });
        const floorsById = { ...state.floorsById };
        for (const object of objects) {
          const target = floorsById[object.floorId];
          floorsById[object.floorId] = {
            ...target,
            objectIds: [...target.objectIds, object.id],
          };
        }
        created = true;
        return {
          projectsById: {
            ...state.projectsById,
            [project.id]: { ...project, updatedAt: new Date().toISOString() },
          },
          floorsById,
          objectsById: {
            ...state.objectsById,
            ...Object.fromEntries(objects.map((object) => [object.id, object])),
          },
        };
      });
      return created;
    },
    createObjectSetArray: (floorId, setId, centers, options) => {
      if (
        !isValidObjectArray(options) ||
        centers.length !== options.columns * options.rows ||
        centers.some((center) => !Number.isFinite(center.x) || !Number.isFinite(center.y))
      )
        return false;
      let created = false;
      commit(centers.length > 1 ? '물품 세트 배열 배치' : '물품 세트 배치', (state) => {
        const floor = state.floorsById[floorId];
        const project = floor && state.projectsById[floor.projectId];
        const template = state.setTemplatesById[setId];
        if (
          !floor ||
          !project ||
          !template ||
          template.projectId !== project.id ||
          centers.length * template.members.length > MAX_SET_PLACED_OBJECTS
        )
          return state;
        const objects = centers.flatMap((center) =>
          layoutObjectsFromSet(template, floorId, center, () => crypto.randomUUID()),
        );
        created = true;
        return {
          projectsById: {
            ...state.projectsById,
            [project.id]: { ...project, updatedAt: new Date().toISOString() },
          },
          floorsById: {
            ...state.floorsById,
            [floorId]: {
              ...floor,
              objectIds: [...floor.objectIds, ...objects.map((object) => object.id)],
            },
          },
          objectsById: {
            ...state.objectsById,
            ...Object.fromEntries(objects.map((object) => [object.id, object])),
          },
        };
      });
      return created;
    },
    applyAutoPlacements: (floorId, roomId, source, options, previewPlacements) => {
      if (previewPlacements.length === 0) return false;
      let applied = false;
      commit('물품 세트 자동 배치', (state) => {
        const floor = state.floorsById[floorId];
        const room = state.roomsById[roomId];
        const project = floor && state.projectsById[floor.projectId];
        const item = source.kind === 'item' ? state.paletteItemsById[source.id] : null;
        const template = source.kind === 'set'
          ? state.setTemplatesById[source.id]
          : item && isValidObjectAppearance(source.appearance)
            ? templateFromPaletteItem(item, source.appearance)
            : null;
        if (
          !floor || !room || room.floorId !== floorId || !floor.roomIds.includes(roomId) ||
          !template || !project || template.projectId !== project.id
        ) return state;
        const existing = floor.objectIds.map((id) => state.objectsById[id]).filter((object) => object != null);
        const fresh = createAutoPlacementPlan(room, template, existing, options);
        if (fresh.error || !sameAutoPlacements(fresh.placements, previewPlacements)) return state;
        const placed = objectsFromAutoPlacements(
          template, floorId, fresh.placements, () => crypto.randomUUID(), source.kind === 'set',
        );
        const objects = item?.floorConnector
          ? placed.flatMap((object) => {
              const connectionId = crypto.randomUUID();
              return project.floorIds.map((targetFloorId) => ({
                ...object,
                id: crypto.randomUUID(),
                floorId: targetFloorId,
                floorConnectionId: connectionId,
                ...floorConnectionLinks(project, targetFloorId),
              }));
            })
          : placed;
        const floorsById = { ...state.floorsById };
        for (const object of objects) {
          const target = floorsById[object.floorId];
          floorsById[object.floorId] = { ...target, objectIds: [...target.objectIds, object.id] };
        }
        applied = true;
        return {
          projectsById: {
            ...state.projectsById,
            [project.id]: { ...project, updatedAt: new Date().toISOString() },
          },
          floorsById,
          objectsById: {
            ...state.objectsById,
            ...Object.fromEntries(objects.map((object) => [object.id, object])),
          },
        };
      });
      return applied;
    },
    updateLayoutObject: (objectId, patch) => {
      let updated = false;
      commit('물품 수정', (state) => {
        const object = state.objectsById[objectId];
        const floor = object && state.floorsById[object.floorId];
        const project = floor && state.projectsById[floor.projectId];
        if (!object || !project || object.locked) return state;
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
        const next = {
          ...object,
          ...appearance,
          x,
          y,
          rotation: snapRightAngle(normalizeObjectRotation(rotation)),
        };
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
        const objectsById = { ...state.objectsById };
        for (const peer of connectedObjects(state.objectsById, [object])) {
          objectsById[peer.id] = {
            ...peer,
            ...appearance,
            x,
            y,
            rotation: next.rotation,
          };
        }
        return {
          projectsById: {
            ...state.projectsById,
            [project.id]: { ...project, updatedAt: new Date().toISOString() },
          },
          objectsById,
        };
      });
      return updated;
    },
    moveLayoutObjects: (objectIds, delta) => {
      if (objectIds.length === 0 || !Number.isFinite(delta.x) || !Number.isFinite(delta.y))
        return false;
      let moved = false;
      commit('물품 이동', (state) => {
        const ids = [...new Set(objectIds)];
        const objects = ids.map((id) => state.objectsById[id]);
        if (objects.some((object) => !object)) return state;
        const peers = connectedObjects(state.objectsById, objects);
        if (peers.some((object) => object.locked)) return state;
        if (
          peers.some(
            (object) =>
              !Number.isFinite(object.x + delta.x) || !Number.isFinite(object.y + delta.y),
          )
        )
          return state;
        const floorId = objects[0].floorId;
        if (objects.some((object) => object.floorId !== floorId)) return state;
        const floor = state.floorsById[floorId];
        const project = floor && state.projectsById[floor.projectId];
        if (!floor || !project) return state;
        moved = true;
        if (delta.x === 0 && delta.y === 0) return state;
        const objectsById = { ...state.objectsById };
        for (const object of peers) {
          objectsById[object.id] = { ...object, x: object.x + delta.x, y: object.y + delta.y };
        }
        return {
          projectsById: {
            ...state.projectsById,
            [project.id]: { ...project, updatedAt: new Date().toISOString() },
          },
          objectsById,
        };
      });
      return moved;
    },
    rotateLayoutObjectGroup: (groupId, degrees) => {
      if (!groupId || !Number.isFinite(degrees)) return false;
      let rotated = false;
      commit('물품 세트 회전', (state) => {
        const members = Object.values(state.objectsById).filter((object) => object.groupId === groupId);
        if (members.length === 0 || members.some((object) => object.locked)) return state;
        const floor = state.floorsById[members[0].floorId];
        const project = floor && state.projectsById[floor.projectId];
        if (!project || members.some((object) => object.floorId !== floor.id)) return state;
        rotated = true;
        if (degrees % 360 === 0) return state;
        const nextMembers = rotateGroupObjects(members, degrees);
        if (nextMembers.some((object) => !Number.isFinite(object.x) || !Number.isFinite(object.y)))
          return state;
        return {
          projectsById: {
            ...state.projectsById,
            [project.id]: { ...project, updatedAt: new Date().toISOString() },
          },
          objectsById: {
            ...state.objectsById,
            ...Object.fromEntries(nextMembers.map((object) => [object.id, object])),
          },
        };
      });
      return rotated;
    },
    duplicateLayoutObjects: (floorId, sourceObjects, offset) => {
      if (
        sourceObjects.length === 0 ||
        !Number.isFinite(offset.x) ||
        !Number.isFinite(offset.y) ||
        sourceObjects.some(
          (object) =>
            !isValidObjectAppearance(object) ||
            !Number.isFinite(object.x + offset.x) ||
            !Number.isFinite(object.y + offset.y) ||
            !Number.isFinite(object.rotation),
        )
      )
        return [];
      let createdIds: string[] = [];
      commit('물품 붙여넣기', (state) => {
        const floor = state.floorsById[floorId];
        const project = floor && state.projectsById[floor.projectId];
        if (!floor || !project || sourceObjects.some((object) => object.floorId !== floorId))
          return state;
        const copiedGroupIds = new Map<string, string>();
        const duplicates = sourceObjects.flatMap((object) => {
          if (object.groupId && !copiedGroupIds.has(object.groupId))
            copiedGroupIds.set(object.groupId, crypto.randomUUID());
          const connectionId = object.floorConnectionId ? crypto.randomUUID() : null;
          return (connectionId ? project.floorIds : [floorId]).map((targetFloorId) => ({
            ...object,
            id: crypto.randomUUID(),
            floorId: targetFloorId,
            x: object.x + offset.x,
            y: object.y + offset.y,
            locked: false,
            ...(object.groupId ? { groupId: copiedGroupIds.get(object.groupId) } : {}),
            ...(connectionId
              ? { floorConnectionId: connectionId, ...floorConnectionLinks(project, targetFloorId) }
              : {}),
          }));
        });
        createdIds = duplicates
          .filter((object) => object.floorId === floorId)
          .map((object) => object.id);
        const floorsById = { ...state.floorsById };
        for (const duplicate of duplicates) {
          const target = floorsById[duplicate.floorId];
          floorsById[duplicate.floorId] = {
            ...target,
            objectIds: [...target.objectIds, duplicate.id],
          };
        }
        return {
          projectsById: {
            ...state.projectsById,
            [project.id]: { ...project, updatedAt: new Date().toISOString() },
          },
          floorsById,
          objectsById: {
            ...state.objectsById,
            ...Object.fromEntries(duplicates.map((object) => [object.id, object])),
          },
        };
      });
      return createdIds;
    },
    setLayoutObjectsLocked: (objectIds, locked) => {
      if (objectIds.length === 0) return false;
      let updated = false;
      commit(locked ? '물품 잠금' : '물품 잠금 해제', (state) => {
        const objects = [...new Set(objectIds)].map((id) => state.objectsById[id]);
        if (objects.some((object) => !object)) return state;
        const floorId = objects[0].floorId;
        if (objects.some((object) => object.floorId !== floorId)) return state;
        const floor = state.floorsById[floorId];
        const project = floor && state.projectsById[floor.projectId];
        if (!floor || !project) return state;
        const peers = connectedObjects(state.objectsById, objects);
        updated = true;
        if (peers.every((object) => object.locked === locked)) return state;
        const objectsById = { ...state.objectsById };
        for (const object of peers) objectsById[object.id] = { ...object, locked };
        return {
          projectsById: {
            ...state.projectsById,
            [project.id]: { ...project, updatedAt: new Date().toISOString() },
          },
          objectsById,
        };
      });
      return updated;
    },
    deleteLayoutObjects: (objectIds) => {
      let deletedIds: string[] = [];
      commit('물품 삭제', (state) => {
        const objects = [...new Set(objectIds)]
          .map((id) => state.objectsById[id])
          .filter(
            (object) =>
              object &&
              !object.locked &&
              connectedObjects(state.objectsById, [object]).every((peer) => !peer.locked),
          );
        if (objects.length === 0) return state;
        const floorId = objects[0].floorId;
        if (objects.some((object) => object.floorId !== floorId)) return state;
        const floor = state.floorsById[floorId];
        const project = floor && state.projectsById[floor.projectId];
        if (!floor || !project) return state;
        deletedIds = objects.map((object) => object.id);
        const peers = connectedObjects(state.objectsById, objects);
        const deletedSet = new Set(peers.map((object) => object.id));
        const objectsById = { ...state.objectsById };
        for (const id of deletedSet) delete objectsById[id];
        const floorsById = { ...state.floorsById };
        for (const peer of peers) {
          const peerFloor = floorsById[peer.floorId];
          floorsById[peer.floorId] = {
            ...peerFloor,
            objectIds: peerFloor.objectIds.filter((id) => !deletedSet.has(id)),
          };
        }
        return {
          projectsById: {
            ...state.projectsById,
            [project.id]: { ...project, updatedAt: new Date().toISOString() },
          },
          floorsById,
          objectsById,
        };
      });
      return deletedIds;
    },
    deleteLayoutObject: (objectId) => get().deleteLayoutObjects([objectId]).length > 0,
    splitRoom: (roomId, path) => {
      let divided = false;
      commit('공간 분할', (state) => {
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
      commit('공간 수정', (state) => {
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
      commit('목표 면적 수정', (state) => {
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
  };
});
