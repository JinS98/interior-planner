import { worldToScreen } from '../../domain/geometry/coordinates';
import type { LayoutObject, Viewport } from '../../types/layout';
import styles from './EditorCanvas.module.scss';

export function LayoutObjectShape({
  object,
  viewport,
  preview = false,
}: {
  object: LayoutObject;
  viewport: Viewport;
  preview?: boolean;
}) {
  const origin = worldToScreen({ x: object.x, y: object.y }, viewport);
  const width = object.width * viewport.scale;
  const height = object.height * viewport.scale;

  return (
    <g
      className={`${styles.layoutObject} ${preview ? styles.objectPreview : ''} ${object.locked ? styles.lockedObject : ''}`}
      transform={`translate(${origin.x} ${origin.y}) rotate(${object.rotation} ${width / 2} ${height / 2})`}
      style={{ color: object.color }}
      data-type={object.type}
    >
      {object.shape === 'rectangle' && (
        <rect
          className={styles.objectBody}
          width={width}
          height={height}
          rx={Math.min(8, width * 0.12, height * 0.12)}
        />
      )}
      {object.shape === 'circle' && (
        <ellipse
          className={styles.objectBody}
          cx={width / 2}
          cy={height / 2}
          rx={width / 2}
          ry={height / 2}
        />
      )}
      {object.shape === 'triangle' && (
        <polygon
          className={styles.objectBody}
          points={`${width / 2},0 ${width},${height} 0,${height}`}
        />
      )}
    </g>
  );
}
