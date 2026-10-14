import type { LayoutObject, ObjectSetMember, ObjectSetTemplate, Point } from '../../types/layout';
import { isValidObjectAppearance } from './catalog';
import { rotatePoint } from './edit';

export const MAX_SET_PLACED_OBJECTS = 500;

function rotatedBounds(object: Pick<ObjectSetMember, 'x' | 'y' | 'width' | 'height' | 'rotation'>) {
  const center = { x: object.x + object.width / 2, y: object.y + object.height / 2 };
  const corners = [
    { x: object.x, y: object.y },
    { x: object.x + object.width, y: object.y },
    { x: object.x + object.width, y: object.y + object.height },
    { x: object.x, y: object.y + object.height },
  ].map((point) => rotatePoint(point, center, object.rotation));
  return {
    left: Math.min(...corners.map((point) => point.x)),
    right: Math.max(...corners.map((point) => point.x)),
    top: Math.min(...corners.map((point) => point.y)),
    bottom: Math.max(...corners.map((point) => point.y)),
  };
}

function setBounds(objects: Pick<ObjectSetMember, 'x' | 'y' | 'width' | 'height' | 'rotation'>[]) {
  const bounds = objects.map(rotatedBounds);
  return {
    left: Math.min(...bounds.map((item) => item.left)),
    right: Math.max(...bounds.map((item) => item.right)),
    top: Math.min(...bounds.map((item) => item.top)),
    bottom: Math.max(...bounds.map((item) => item.bottom)),
  };
}

/** 배치된 물품을 세트 중심 기준 상대 좌표로 복사한다. */
export function normalizeSetMembers(objects: LayoutObject[]): ObjectSetMember[] | null {
  if (objects.length === 0 || objects.length > 100) return null;
  if (
    objects.some(
      (object) =>
        !Number.isFinite(object.x) ||
        !Number.isFinite(object.y) ||
        !Number.isFinite(object.rotation) ||
        !isValidObjectAppearance(object),
    )
  )
    return null;

  const { left, right, top, bottom } = setBounds(objects);
  const center = { x: (left + right) / 2, y: (top + bottom) / 2 };

  return objects.map((object) => ({
    category: object.category,
    type: object.type,
    name: object.name,
    x: object.x - center.x,
    y: object.y - center.y,
    width: object.width,
    height: object.height,
    color: object.color,
    shape: object.shape,
    rotation: object.rotation,
  }));
}

export function objectSetFootprint(template: ObjectSetTemplate) {
  const { left, right, top, bottom } = setBounds(template.members);
  return { width: right - left, height: bottom - top };
}

/** 하나의 세트 인스턴스를 만들되 구성 물품은 개별 편집이 가능하게 저장한다. */
export function layoutObjectsFromSet(
  template: ObjectSetTemplate,
  floorId: string,
  center: Point,
  nextId: () => string,
): LayoutObject[] {
  const groupId = nextId();
  return template.members.map((member) => ({
    ...member,
    id: nextId(),
    floorId,
    x: center.x + member.x,
    y: center.y + member.y,
    locked: false,
    groupId,
    groupTemplateId: template.id,
  }));
}
