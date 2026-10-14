import type { Floor, LayoutObject, Project } from '../../types/layout';

/** 프로젝트의 층 순서에서 바로 아래·위 층을 찾는다. */
export function floorConnectionLinks(project: Project, floorId: string) {
  const index = project.floorIds.indexOf(floorId);
  return {
    fromFloorId: index > 0 ? project.floorIds[index - 1] : null,
    toFloorId: index >= 0 ? (project.floorIds[index + 1] ?? null) : null,
  };
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
