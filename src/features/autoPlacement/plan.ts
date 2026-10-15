import type { LayoutObject, ObjectAppearance, ObjectSetTemplate, PaletteItem, Room } from '../../types/layout';
import { MAX_SET_PLACED_OBJECTS } from '../object/setPresets';
import {
  generateGridCandidates,
  selectCompatibleCandidates,
  type GridCandidateError,
  type GridPlacementCandidate,
} from './gridCandidates';

export interface AutoPlacementOptions {
  gridStepMeters: number;
  minimumAisleWidthMeters: number;
  wallClearanceMeters: number;
  maxPlacements: number;
}

export type AutoPlacementSource =
  | { kind: 'set'; id: string }
  | { kind: 'item'; id: string; appearance: ObjectAppearance };

export interface AutoPlacementPlan {
  placements: GridPlacementCandidate[];
  error: GridCandidateError | null;
  truncated: boolean;
  effectiveGridStepMeters: number;
}

export function templateFromPaletteItem(item: PaletteItem, appearance: ObjectAppearance): ObjectSetTemplate {
  return {
    id: item.id,
    projectId: item.projectId,
    name: item.name,
    members: [{
      category: item.category,
      type: item.id,
      name: item.name,
      x: -appearance.width / 2,
      y: -appearance.height / 2,
      ...appearance,
      rotation: 0,
    }],
  };
}

/** 0m는 무한 격자 대신 방 크기에 맞춘 자동 탐색 해상도다. */
export function effectiveGridStep(room: Room, requestedStep: number): number {
  if (requestedStep !== 0 || room.vertices.length === 0) return requestedStep;
  const xs = room.vertices.map((point) => point.x);
  const ys = room.vertices.map((point) => point.y);
  const longestSide = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return Math.max(0.1, Math.ceil((longestSide / 80) * 10) / 10);
}

export function createAutoPlacementPlan(
  room: Room,
  template: ObjectSetTemplate,
  existingObjects: LayoutObject[],
  options: AutoPlacementOptions,
): AutoPlacementPlan {
  if (
    template.members.length === 0 ||
    !Number.isInteger(options.maxPlacements) ||
    options.maxPlacements < 1 ||
    options.maxPlacements * template.members.length > MAX_SET_PLACED_OBJECTS
  )
    return { placements: [], error: 'invalid-options', truncated: false, effectiveGridStepMeters: options.gridStepMeters };

  const step = effectiveGridStep(room, options.gridStepMeters);
  const result = generateGridCandidates(room, template.members, existingObjects, {
    ...options,
    gridStepMeters: step,
    maxCandidates: 5_000,
  });
  return {
    placements: result.error
      ? []
      : selectCompatibleCandidates(
          result.candidates,
          existingObjects,
          options.minimumAisleWidthMeters,
          options.maxPlacements,
        ),
    error: result.error,
    truncated: result.truncated,
    effectiveGridStepMeters: step,
  };
}

/** Preview와 확정에 같은 좌표 변환을 사용한다. */
export function objectsFromAutoPlacements(
  template: ObjectSetTemplate,
  floorId: string,
  placements: GridPlacementCandidate[],
  nextId: () => string,
  grouped = true,
): LayoutObject[] {
  return placements.flatMap((placement) => {
    const groupId = grouped ? nextId() : null;
    return template.members.map((member, index) => {
      const transformed = placement.members[index];
      return {
        ...member,
        id: nextId(),
        floorId,
        x: placement.center.x + transformed.center.x - member.width / 2,
        y: placement.center.y + transformed.center.y - member.height / 2,
        rotation: transformed.rotation,
        locked: false,
        ...(groupId ? { groupId, groupTemplateId: template.id } : {}),
      };
    });
  });
}

export function sameAutoPlacements(
  first: GridPlacementCandidate[],
  second: GridPlacementCandidate[],
): boolean {
  return first.length === second.length && first.every((placement, index) => {
    const other = second[index];
    return placement.roomId === other.roomId &&
      placement.floorId === other.floorId &&
      placement.center.x === other.center.x &&
      placement.center.y === other.center.y &&
      placement.rotation === other.rotation &&
      placement.members.length === other.members.length;
  });
}
