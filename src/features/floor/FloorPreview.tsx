import { useProjectStore } from '../../store/projectStore';
import type { Floor, LayoutObject } from '../../types/layout';
import { floorConnectionLabel } from './connection';
import { floorContentBounds } from './viewport';
import styles from './FloorBoard.module.scss';

function PreviewObject({ object, label }: { object: LayoutObject; label: string | null }) {
  const centerX = object.x + object.width / 2;
  const centerY = object.y + object.height / 2;
  return (
    <>
      <g
        transform={`rotate(${object.rotation} ${centerX} ${centerY})`}
        style={{ color: object.color }}
        className={`${styles.previewObject} ${object.floorConnectionId ? styles.previewConnector : ''}`}
      >
        {label && (
          <title>
            {object.name} · {label}
          </title>
        )}
        {object.shape === 'rectangle' && (
          <rect x={object.x} y={object.y} width={object.width} height={object.height} rx={0.08} />
        )}
        {object.shape === 'circle' && (
          <ellipse cx={centerX} cy={centerY} rx={object.width / 2} ry={object.height / 2} />
        )}
        {object.shape === 'triangle' && (
          <polygon
            points={`${centerX},${object.y} ${object.x + object.width},${object.y + object.height} ${object.x},${object.y + object.height}`}
          />
        )}
      </g>
      {label && (
        <text
          className={styles.previewConnectionLabel}
          x={centerX}
          y={object.y - 0.1}
          textAnchor="middle"
        >
          {label}
        </text>
      )}
    </>
  );
}

export function FloorPreview({ floor, onSelect }: { floor: Floor; onSelect: () => void }) {
  const roomsById = useProjectStore((state) => state.roomsById);
  const objectsById = useProjectStore((state) => state.objectsById);
  const floorsById = useProjectStore((state) => state.floorsById);
  const rooms = floor.roomIds.map((id) => roomsById[id]).filter((room) => room);
  const objects = floor.objectIds.map((id) => objectsById[id]).filter((object) => object);
  const bounds = floorContentBounds(floor, roomsById, objectsById);
  const view = bounds
    ? {
        x: bounds.minX - 1,
        y: bounds.minY - 1,
        width: Math.max(4, bounds.maxX - bounds.minX + 2),
        height: Math.max(3, bounds.maxY - bounds.minY + 2),
      }
    : { x: -1, y: -1, width: 6, height: 4 };
  const patternId = `floor-grid-${floor.id}`;

  return (
    <button
      type="button"
      className={styles.preview}
      onClick={onSelect}
      aria-label={`${floor.name} 도면을 선택해 편집`}
    >
      <svg
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <defs>
          <pattern id={patternId} width="1" height="1" patternUnits="userSpaceOnUse">
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#e7eaf0" strokeWidth="0.02" />
          </pattern>
        </defs>
        <rect x={view.x} y={view.y} width={view.width} height={view.height} fill="#f9fafc" />
        <rect
          x={view.x}
          y={view.y}
          width={view.width}
          height={view.height}
          fill={`url(#${patternId})`}
        />
        {rooms.map((room) => (
          <polygon
            key={room.id}
            className={styles.previewRoom}
            points={room.vertices.map((vertex) => `${vertex.x},${vertex.y}`).join(' ')}
          />
        ))}
        {objects.map((object) => (
          <PreviewObject
            key={object.id}
            object={object}
            label={floorConnectionLabel(object, floorsById)}
          />
        ))}
      </svg>
      {rooms.length === 0 && objects.length === 0 && <span className={styles.empty}>빈 도면</span>}
      <span className={styles.previewHint}>클릭해 편집</span>
    </button>
  );
}
