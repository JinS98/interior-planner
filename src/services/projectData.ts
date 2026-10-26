import { createDefaultPaletteItems } from '../features/object/catalog';
import type { ProjectSnapshot } from '../features/history/command';
import type { Floor, Project } from '../types/layout';

export function createEmptyProject(ownerId: string, name = '제목 없는 프로젝트'): ProjectSnapshot {
  const projectId = crypto.randomUUID();
  const floorId = crypto.randomUUID();
  const palette = createDefaultPaletteItems(projectId);
  const project: Project = {
    id: projectId,
    ownerId,
    name: name.trim().slice(0, 60) || '제목 없는 프로젝트',
    purpose: 'other',
    targetAreaSqm: null,
    floorIds: [floorId],
    paletteItemIds: palette.map((item) => item.id),
    setTemplateIds: [],
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
  };
  const floor: Floor = { id: floorId, projectId, name: '1F', roomIds: [], objectIds: [] };
  return {
    projectsById: { [projectId]: project },
    floorsById: { [floorId]: floor },
    roomsById: {},
    objectsById: {},
    paletteItemsById: Object.fromEntries(palette.map((item) => [item.id, item])),
    setTemplatesById: {},
  };
}

/** Excludes other projects and all editor/history state from a cloud save. */
export function dataForProject(data: ProjectSnapshot, projectId: string): ProjectSnapshot {
  const project = data.projectsById[projectId];
  if (!project) throw new Error('저장할 프로젝트가 없습니다.');
  if (!Array.isArray(project.floorIds) || project.floorIds.length === 0)
    throw new Error('프로젝트에 층이 없습니다.');
  if (!Array.isArray(project.paletteItemIds) || !Array.isArray(project.setTemplateIds))
    throw new Error('프로젝트의 물품 목록이 올바르지 않습니다.');
  const floors = project.floorIds.map((id) => data.floorsById[id]);
  if (floors.some((floor) => !floor || floor.projectId !== projectId))
    throw new Error('프로젝트의 층 데이터가 올바르지 않습니다.');
  if (floors.some((floor) => !Array.isArray(floor.roomIds) || !Array.isArray(floor.objectIds)))
    throw new Error('층의 공간 또는 물품 목록이 올바르지 않습니다.');
  const rooms = floors.flatMap((floor) => floor.roomIds.map((id) => data.roomsById[id]));
  const objects = floors.flatMap((floor) => floor.objectIds.map((id) => data.objectsById[id]));
  const palette = project.paletteItemIds.map((id) => data.paletteItemsById[id]);
  const templates = project.setTemplateIds.map((id) => data.setTemplatesById[id]);
  if (
    rooms.some((room) => !room || !floors.some((floor) => floor.id === room.floorId)) ||
    objects.some((object) => !object || !floors.some((floor) => floor.id === object.floorId)) ||
    palette.some((item) => !item || item.projectId !== projectId) ||
    templates.some((template) => !template || template.projectId !== projectId)
  )
    throw new Error('프로젝트에 누락된 공간 또는 물품 데이터가 있습니다.');
  return {
    projectsById: { [projectId]: project },
    floorsById: Object.fromEntries(floors.map((floor) => [floor.id, floor])),
    roomsById: Object.fromEntries(rooms.map((room) => [room.id, room])),
    objectsById: Object.fromEntries(objects.map((object) => [object.id, object])),
    paletteItemsById: Object.fromEntries(palette.map((item) => [item.id, item])),
    setTemplatesById: Object.fromEntries(templates.map((template) => [template.id, template])),
  };
}

export function parseProjectData(
  value: unknown,
  ownerId: string,
  projectId: string,
): ProjectSnapshot {
  if (!value || typeof value !== 'object')
    throw new Error('저장된 프로젝트 형식을 읽을 수 없습니다.');
  const data = value as ProjectSnapshot;
  if (
    !data.projectsById ||
    !data.floorsById ||
    !data.roomsById ||
    !data.objectsById ||
    !data.paletteItemsById ||
    !data.setTemplatesById ||
    data.projectsById[projectId]?.ownerId !== ownerId ||
    data.projectsById[projectId]?.schemaVersion !== 1
  )
    throw new Error('지원하지 않는 프로젝트 데이터입니다.');
  return dataForProject(data, projectId);
}
