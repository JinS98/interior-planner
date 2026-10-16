import type { Floor, LayoutObject, Project } from '../../types/layout';

/** 프로젝트의 층 순서에서 바로 아래·위 층을 찾는다. */
export function floorConnectionLinks(project: Project, floorId: string) {
  const index = project.floorIds.indexOf(floorId);
  return {
    fromFloorId: index > 0 ? project.floorIds[index - 1] : null,
    toFloorId: index >= 0 ? (project.floorIds[index + 1] ?? null) : null,
  };
}

/** Promote existing placements of a palette item into floor connections. */
export function connectExistingPaletteObjects(
  project: Project,
  paletteItemId: string,
  floorsById: Record<string, Floor>,
  objectsById: Record<string, LayoutObject>,
): { floorsById: Record<string, Floor>; objectsById: Record<string, LayoutObject> } {
  const nextFloors = { ...floorsById };
  const nextObjects = { ...objectsById };
  const groupsByPlacement = new Map<string, { objects: LayoutObject[]; floorIds: Set<string> }[]>();

  for (const floorId of project.floorIds) {
    for (const objectId of floorsById[floorId]?.objectIds ?? []) {
      const object = objectsById[objectId];
      if (!object || object.type !== paletteItemId || object.floorConnectionId) continue;
      // Matching manual placements on different floors are one connection.
      const placement = JSON.stringify([
        object.x,
        object.y,
        object.width,
        object.height,
        object.rotation,
        object.color,
        object.shape,
      ]);
      const groups = groupsByPlacement.get(placement) ?? [];
      let group = groups.find((candidate) => !candidate.floorIds.has(floorId));
      if (!group) {
        group = { objects: [], floorIds: new Set() };
        groups.push(group);
        groupsByPlacement.set(placement, groups);
      }
      group.objects.push(object);
      group.floorIds.add(floorId);
    }
  }

  if (groupsByPlacement.size === 0) return { floorsById, objectsById };

  for (const groups of groupsByPlacement.values()) {
    for (const { objects } of groups) {
      const connectionId = crypto.randomUUID();
      const source = objects[0];
      const existingByFloor = new Map(objects.map((object) => [object.floorId, object]));
      for (const floorId of project.floorIds) {
        const existing = existingByFloor.get(floorId);
        if (existing) {
          nextObjects[existing.id] = {
            ...existing,
            floorConnectionId: connectionId,
            ...floorConnectionLinks(project, floorId),
          };
          continue;
        }
        // Group membership belongs to the original floor, not the new copy.
        const duplicate: LayoutObject = {
          ...source,
          id: crypto.randomUUID(),
          floorId,
          floorConnectionId: connectionId,
          ...floorConnectionLinks(project, floorId),
        };
        delete duplicate.groupId;
        delete duplicate.groupTemplateId;
        nextObjects[duplicate.id] = duplicate;
        const floor = nextFloors[floorId];
        nextFloors[floorId] = { ...floor, objectIds: [...floor.objectIds, duplicate.id] };
      }
    }
  }

  return { floorsById: nextFloors, objectsById: nextObjects };
}

/** 연결 물품을 편집할 때 같은 연결에 속한 모든 층의 물품을 포함한다. */
export function connectedObjects(
  objectsById: Record<string, LayoutObject>,
  selected: LayoutObject[],
): LayoutObject[] {
  const selectedIds = new Set(selected.map((object) => object.id));
  const connectionIds = new Set(
    selected.map((object) => object.floorConnectionId).filter((id) => id != null),
  );
  return Object.values(objectsById).filter(
    (object) => selectedIds.has(object.id) || connectionIds.has(object.floorConnectionId ?? ''),
  );
}

/** 층 추가·삭제 후 남은 모든 연결 물품의 이웃 층 ID를 갱신한다. */
export function refreshFloorConnectionLinks(
  project: Project,
  floorsById: Record<string, Floor>,
  objectsById: Record<string, LayoutObject>,
): Record<string, LayoutObject> {
  const next = { ...objectsById };
  for (const floorId of project.floorIds) {
    for (const objectId of floorsById[floorId]?.objectIds ?? []) {
      const object = next[objectId];
      if (object?.floorConnectionId) {
        next[objectId] = { ...object, ...floorConnectionLinks(project, floorId) };
      }
    }
  }
  return next;
}

export function floorConnectionLabel(
  object: LayoutObject,
  floorsById: Record<string, Floor>,
): string | null {
  if (!object.floorConnectionId) return null;
  const below = object.fromFloorId && floorsById[object.fromFloorId]?.name;
  const above = object.toFloorId && floorsById[object.toFloorId]?.name;
  if (above && below) return `↓ ${below} · ↑ ${above}`;
  if (above) return `↑ ${above}`;
  if (below) return `↓ ${below}`;
  return '층 연결';
}
