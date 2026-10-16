import type {
  LayoutObject,
  ObjectAppearance,
  ObjectShape,
  PaletteItem,
  Point,
} from '../../types/layout';

export const OBJECT_PRESETS = [
  {
    id: 'desk',
    name: '책상',
    category: 'furniture',
    width: 1,
    height: 0.6,
    color: '#D5A56D',
    shape: 'rectangle',
  },
  {
    id: 'chair',
    name: '의자',
    category: 'furniture',
    width: 0.4,
    height: 0.4,
    color: '#82A7DE',
    shape: 'circle',
  },
  {
    id: 'door',
    name: '출입구(문)',
    category: 'facility',
    width: 0.9,
    height: 0.14,
    color: '#A9794E',
    shape: 'rectangle',
    wallOpening: true,
    wallOpeningStyle: 'door',
  },
] as const;

export type ObjectPresetId = (typeof OBJECT_PRESETS)[number]['id'];
export const NEW_PALETTE_APPEARANCE: ObjectAppearance = {
  width: 1,
  height: 1,
  color: '#B996D8',
  shape: 'rectangle',
};

export function createDefaultPaletteItems(projectId: string): PaletteItem[] {
  return OBJECT_PRESETS.map((preset) => ({ ...preset, projectId, builtIn: true }));
}
export const OBJECT_SHAPES: { id: ObjectShape; label: string }[] = [
  { id: 'rectangle', label: '사각형' },
  { id: 'circle', label: '원' },
  { id: 'triangle', label: '삼각형' },
];
export const MIN_OBJECT_SIZE_METERS = 0.1;
export const MAX_OBJECT_SIZE_METERS = 20;

export function getObjectPreset(type: ObjectPresetId) {
  return OBJECT_PRESETS.find((preset) => preset.id === type)!;
}

export function defaultObjectAppearance(type: ObjectPresetId): ObjectAppearance {
  const { width, height, color, shape } = getObjectPreset(type);
  return { width, height, color, shape };
}

export function isValidObjectAppearance(appearance: ObjectAppearance): boolean {
  return (
    Number.isFinite(appearance.width) &&
    appearance.width >= MIN_OBJECT_SIZE_METERS &&
    appearance.width <= MAX_OBJECT_SIZE_METERS &&
    Number.isFinite(appearance.height) &&
    appearance.height >= MIN_OBJECT_SIZE_METERS &&
    appearance.height <= MAX_OBJECT_SIZE_METERS &&
    /^#[\da-fA-F]{6}$/.test(appearance.color) &&
    OBJECT_SHAPES.some(({ id }) => id === appearance.shape)
  );
}

/** Palette를 선택한 뒤 클릭한 World 좌표가 오브젝트의 중심이 되도록 만든다. */
export function layoutObjectFromPreset(
  floorId: string,
  type: ObjectPresetId,
  center: Point,
  id: string,
  appearance: ObjectAppearance = defaultObjectAppearance(type),
): LayoutObject {
  return layoutObjectFromPaletteItem(
    floorId,
    { ...getObjectPreset(type), projectId: '', builtIn: true },
    center,
    id,
    appearance,
  );
}

export function layoutObjectFromPaletteItem(
  floorId: string,
  item: PaletteItem,
  center: Point,
  id: string,
  appearance: ObjectAppearance = item,
): LayoutObject {
  return {
    id,
    floorId,
    category: item.category,
    type: item.id,
    name: item.name,
    x: center.x - appearance.width / 2,
    y: center.y - appearance.height / 2,
    width: appearance.width,
    height: appearance.height,
    color: appearance.color,
    shape: appearance.shape,
    rotation: 0,
    locked: false,
    ...(item.wallOpening ? { wallOpening: true } : {}),
    ...(item.wallOpening ? { wallOpeningStyle: item.wallOpeningStyle ?? 'door' } : {}),
  };
}
