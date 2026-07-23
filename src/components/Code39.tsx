// Code 39 barcode as inline SVG — no fonts or external libs, so printed box
// labels stay scannable from any browser. Supports A-Z 0-9 - . and space,
// which covers the BOX-<invoice>-<n> barcodes the pack station generates.

/** 9 elements per char (bar,space,bar,…), n = narrow, w = wide. */
const CODE39: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  "*": "nwnnwnwnn",
};

export function Code39({
  value,
  height = 52,
  narrow = 2,
  className,
}: {
  value: string;
  height?: number;
  /** Narrow element width in px; wide elements are 3×. */
  narrow?: number;
  className?: string;
}) {
  const sanitized = value.toUpperCase().replace(/[^A-Z0-9\-. ]/g, "-");
  const chars = `*${sanitized}*`.split("");
  const wide = narrow * 3;

  const rects: Array<{ x: number; w: number }> = [];
  let x = 0;
  for (const ch of chars) {
    const pattern = CODE39[ch];
    if (!pattern) continue;
    for (let i = 0; i < pattern.length; i += 1) {
      const w = pattern[i] === "w" ? wide : narrow;
      if (i % 2 === 0) rects.push({ x, w }); // even indices are bars
      x += w;
    }
    x += narrow; // inter-character gap
  }
  const width = Math.max(1, x - narrow);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={sanitized}
      className={className}
      shapeRendering="crispEdges"
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={0} width={r.w} height={height} fill="#000" />
      ))}
    </svg>
  );
}
