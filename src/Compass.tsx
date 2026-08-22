const TICKS = [0, 45, 90, 135, 180, 225, 270, 315];

/**
 * The Kapehu wordmark: a drawn compass rose. In its resting state it points
 * to a fixed, gently glowing bearing; while `seeking` it swings back and
 * forth like a real needle settling, standing in for "thinking" rather than
 * a generic spinner.
 */
export function CompassMark({
  size = 32,
  seeking = false,
}: {
  size?: number;
  seeking?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`compass-mark${seeking ? " seeking" : ""}`}
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="47" className="compass-ring-outer" />
      <circle cx="50" cy="50" r="38" className="compass-ring-inner" />
      {TICKS.map((deg) => (
        <line
          key={deg}
          x1="50"
          y1="6"
          x2="50"
          y2={deg % 90 === 0 ? "13" : "9"}
          className="compass-tick"
          strokeWidth={deg % 90 === 0 ? 2 : 1}
          transform={`rotate(${deg} 50 50)`}
        />
      ))}
      <g className="compass-needle">
        <polygon points="50,16 43,50 50,55 57,50" className="compass-needle-north" />
        <polygon points="50,84 43,50 50,45 57,50" className="compass-needle-south" />
      </g>
      <circle cx="50" cy="50" r="4.5" className="compass-pivot" />
    </svg>
  );
}
