import "./BarChart.css";
import { validChartRows } from "./barChartUtils";

const formatNumber = (value) => Number.isInteger(value) ? String(value) : Number(value.toFixed(2)).toString();
const niceStep = (span) => {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const rough = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / magnitude;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude;
};

export default function BarChart({ rows = [], allowNegative = false, title = "Bar chart preview" }) {
  const data = validChartRows(rows, allowNegative);
  if (!data.length) return <div className="bar-chart-empty" role="status"><span className="bar-chart-empty-icon" aria-hidden="true">▥</span><strong>Your chart will appear here</strong><span>Enter a category and a valid numerical value to begin.</span></div>;

  const width = Math.max(560, data.length * 72);
  const height = 300;
  const margin = { top: 18, right: 20, bottom: 70, left: 58 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const rawMin = Math.min(0, ...data.map((item) => item.value));
  const rawMax = Math.max(0, ...data.map((item) => item.value));
  const step = niceStep(rawMax - rawMin);
  const min = rawMin < 0 ? Math.floor(rawMin / step) * step : 0;
  const max = rawMax > 0 ? Math.ceil(rawMax / step) * step || step : step;
  const y = (value) => margin.top + ((max - value) / (max - min)) * plotHeight;
  const baseline = y(0);
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, index) => min + index * step);
  const slot = plotWidth / data.length;
  const barWidth = Math.min(42, slot * 0.64);

  return <div className="bar-chart-wrap">
    <svg className="bar-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${data.map((item) => `${item.category}, ${formatNumber(item.value)}`).join("; ")}`}>
      <title>{title}</title>
      {ticks.map((tick) => <g key={tick} className="bar-chart-tick"><line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)}/><text x={margin.left - 10} y={y(tick) + 4} textAnchor="end">{formatNumber(tick)}</text></g>)}
      <line className="bar-chart-axis" x1={margin.left} x2={margin.left} y1={margin.top} y2={height - margin.bottom}/>
      <line className="bar-chart-axis" x1={margin.left} x2={width - margin.right} y1={baseline} y2={baseline}/>
      <text className="bar-chart-axis-title" transform={`translate(15 ${margin.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle">Value</text>
      <text className="bar-chart-axis-title" x={margin.left + plotWidth / 2} y={height - 8} textAnchor="middle">Category</text>
      {data.map((item, index) => {
        const x = margin.left + slot * index + (slot - barWidth) / 2;
        const valueY = y(item.value);
        const barY = Math.min(valueY, baseline);
        const barHeight = Math.max(1, Math.abs(baseline - valueY));
        const label = item.category.length > 12 ? `${item.category.slice(0, 11)}…` : item.category;
        return <g className="bar-chart-bar" key={`${item.category}-${index}`}>
          <rect x={x} y={barY} width={barWidth} height={barHeight} rx="5"><title>{`${item.category}: ${formatNumber(item.value)}`}</title></rect>
          <text className="bar-chart-value" x={x + barWidth / 2} y={item.value < 0 ? Math.min(height - margin.bottom - 5, baseline + barHeight + 16) : Math.max(margin.top + 12, barY - 7)} textAnchor="middle">{formatNumber(item.value)}</text>
          <text className="bar-chart-category" x={x + barWidth / 2} y={height - margin.bottom + 19} textAnchor="middle"><title>{item.category}</title>{label}</text>
        </g>;
      })}
    </svg>
  </div>;
}
