import { memo } from 'react';
import { worldToScreen } from '../../domain/geometry/coordinates';
import type { LayoutObject, Room, Viewport } from '../../types/layout';
import { doorSwingSide } from '../../features/object/wallOpening';
import styles from './EditorCanvas.module.scss';
import { DoorSymbol } from './DoorSymbol';

export const LayoutObjectShape = memo(function LayoutObjectShape({
  object,
  viewport,
  preview = false,
  connectionLabel,
  rooms = [],
}: {
  object: LayoutObject;
  viewport: Viewport;
  preview?: boolean;
  connectionLabel?: string | null;
  rooms?: Room[];
}) {
  const origin = worldToScreen({ x: object.x, y: object.y }, viewport);
  const width = object.width * viewport.scale;
  const height = object.height * viewport.scale;

  return (
    <>
      <g
        className={`${styles.layoutObject} ${preview ? styles.objectPreview : ''} ${object.locked ? styles.lockedObject : ''} ${object.floorConnectionId ? styles.floorConnector : ''}`}
        transform={`translate(${origin.x} ${origin.y}) rotate(${object.rotation} ${width / 2} ${height / 2})`}
        style={{ color: object.color }}
        fill="currentColor"
        stroke="#40516b"
        strokeWidth={2}
        data-type={object.type}
      >
        {connectionLabel && (
          <title>
            {object.name} · {connectionLabel}
          </title>
        )}
        {object.wallOpening && (
          <DoorSymbol
            width={width}
            height={height}
            strokeWidth={1.6}
            style={object.wallOpeningStyle}
            swingSide={doorSwingSide(object, rooms)}
          />
        )}
        {!object.wallOpening && object.shape === 'rectangle' && (
          <rect
            className={styles.objectBody}
            width={width}
            height={height}
            rx={Math.min(8, width * 0.12, height * 0.12)}
          />
        )}
        {!object.wallOpening && object.shape === 'circle' && (
          <ellipse
            className={styles.objectBody}
            cx={width / 2}
            cy={height / 2}
            rx={width / 2}
            ry={height / 2}
          />
        )}
        {!object.wallOpening && object.shape === 'triangle' && (
          <polygon
            className={styles.objectBody}
            points={`${width / 2},0 ${width},${height} 0,${height}`}
          />
        )}
      </g>
      {connectionLabel && !preview && (
        <text
          className={styles.floorConnectionLabel}
          x={origin.x + width / 2}
          y={origin.y - 7}
          textAnchor="middle"
        >
          {connectionLabel}
        </text>
      )}
    </>
  );
});
