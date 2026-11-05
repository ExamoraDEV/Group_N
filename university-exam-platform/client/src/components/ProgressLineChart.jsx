export default function ProgressLineChart({ points = [], label = "Published assessment percentage", color = "#6d63db" }) {
  const rows = points.filter((point) => Number.isFinite(Number(point.percentage)));
  if (!rows.length) return <div className="progress-chart-empty">A chart will appear when released result data is available.</div>;
  const width = 760;
  const height = 300;
  const left = 54;
  const right = 18;
  const top = 18;
  const bottom = 52;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const x = (index) => rows.length === 1 ? left + plotWidth / 2 : left + (index / (rows.length - 1)) * plotWidth;
  const y = (value) => top + ((100 - Math.min(100, Math.max(0, Number(value)))) / 100) * plotHeight;
  const line = rows.map((point, index) => `${x(index)},${y(point.percentage)}`).join(" ");
  const labelIndexes = rows.length <= 7 ? rows.map((_, index) => index) : [...new Set([0, Math.round((rows.length - 1) / 3), Math.round(2 * (rows.length - 1) / 3), rows.length - 1])];
  return <div className="progress-chart-wrap">
    <p className="sr-only">{label}. {rows.map((point) => `${point.label}: ${Number(point.percentage).toFixed(1)} percent`).join("; ")}</p>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="progress-line-chart" preserveAspectRatio="xMidYMid meet">
      {[0, 25, 50, 75, 100].map((tick) => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="progress-chart-gridline"/><text x={left - 10} y={y(tick) + 4} textAnchor="end" className="progress-chart-axis-label">{tick}%</text></g>)}
      <line x1={left} x2={left} y1={top} y2={height - bottom} className="progress-chart-axis"/>
      <line x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} className="progress-chart-axis"/>
      {rows.length > 1 && <polyline points={line} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>}
      {rows.map((point, index) => <g key={`${point.id || point.label}-${index}`} tabIndex="0" className="progress-chart-point"><circle cx={x(index)} cy={y(point.percentage)} r="5" fill={color}><title>{`${point.label}: ${point.marksObtained ?? "—"}/${point.maximumMarks ?? "—"} marks (${Number(point.percentage).toFixed(1)}%)${point.date ? ` · ${point.date}` : ""}`}</title></circle>{labelIndexes.includes(index) && <text x={x(index)} y={height - 25} textAnchor="middle" className="progress-chart-x-label">{String(point.label).length > 15 ? `${String(point.label).slice(0, 13)}…` : point.label}</text>}</g>)}
      <text x={left} y={height - 6} className="progress-chart-axis-title">Assessment sequence · chronological</text>
    </svg>
  </div>;
}
