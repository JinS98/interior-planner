import type { ObjectAppearance, Point } from '../../types/layout';

export interface ObjectArrayOptions {
  columns: number;
  rows: number;
  gapX: number;
  gapY: number;
}

export const DEFAULT_OBJECT_ARRAY: ObjectArrayOptions = {
  columns: 1,
  rows: 1,
  gapX: 0,
  gapY: 0,
};

export function objectArrayFootprint(
  appearance: Pick<ObjectAppearance, 'width' | 'height'>,
  options: ObjectArrayOptions,
) {
  return {
    width: appearance.width * options.columns + options.gapX * (options.columns - 1),
    height: appearance.height * options.rows + options.gapY * (options.rows - 1),
  };
}

/** 클릭 지점은 배열 전체의 중심이다. 배열은 행 우선 순서로 놓는다. */
export function objectArrayCenters(
  center: Point,
  appearance: Pick<ObjectAppearance, 'width' | 'height'>,
  options: ObjectArrayOptions,
): Point[] {
  const footprint = objectArrayFootprint(appearance, options);
  return Array.from({ length: options.rows }, (_, row) =>
    Array.from({ length: options.columns }, (_, column) => ({
      x:
        center.x -
        footprint.width / 2 +
        appearance.width / 2 +
        column * (appearance.width + options.gapX),
      y:
        center.y -
        footprint.height / 2 +
        appearance.height / 2 +
        row * (appearance.height + options.gapY),
    })),
  ).flat();
}

export function isValidObjectArray(options: ObjectArrayOptions): boolean {
  return (
    Number.isInteger(options.columns) &&
    Number.isInteger(options.rows) &&
    options.columns >= 1 &&
    options.rows >= 1 &&
    options.columns * options.rows <= 100 &&
    Number.isFinite(options.gapX) &&
    Number.isFinite(options.gapY) &&
    options.gapX >= 0 &&
    options.gapY >= 0 &&
    options.gapX <= 20 &&
    options.gapY <= 20
  );
}
