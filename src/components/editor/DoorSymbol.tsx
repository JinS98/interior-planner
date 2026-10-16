import { DOOR_OPEN_ANGLE_DEGREES } from '../../features/object/wallOpening';

/** The pale threshold hides the room outline and the arc shows the door swing. */
export function DoorSymbol({
  width,
  height,
  strokeWidth,
  style = 'door',
  swingSide = -1,
}: {
  width: number;
  height: number;
  strokeWidth: number;
  style?: 'door' | 'passage';
  swingSide?: -1 | 1;
}) {
  const hingeY = height / 2;
  const radius = width - strokeWidth * 2;
  const angle = (DOOR_OPEN_ANGLE_DEGREES * Math.PI) / 180;
  const openX = radius * Math.cos(angle);
  const openY = radius * Math.sin(angle);
  return (
    <g data-kind="wall-opening">
      <rect x={0} y={0} width={width} height={height} fill="#f9fafc" stroke="none" />
      {style === 'door' && (
        <>
          <line
            x1={0}
            y1={hingeY}
            x2={openX}
            y2={hingeY + swingSide * openY}
            stroke="currentColor"
            strokeWidth={strokeWidth * 1.5}
            strokeLinecap="round"
          />
          <path
            d={`M ${radius} ${hingeY} A ${radius} ${radius} 0 0 ${swingSide === 1 ? 1 : 0} ${openX} ${hingeY + swingSide * openY}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={`${strokeWidth * 3} ${strokeWidth * 2}`}
          />
        </>
      )}
      {style === 'door' ? (
        <circle cx={0} cy={hingeY} r={strokeWidth * 1.6} fill="currentColor" stroke="none" />
      ) : (
        <>
          <line x1={0} y1={0} x2={0} y2={height} stroke="currentColor" strokeWidth={strokeWidth} />
          <line x1={width} y1={0} x2={width} y2={height} stroke="currentColor" strokeWidth={strokeWidth} />
        </>
      )}
    </g>
  );
}
