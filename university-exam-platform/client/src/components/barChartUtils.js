export function validChartRows(rows = [], allowNegative = false) {
  if (!Array.isArray(rows)) return [];
  const candidates = rows.map((row) => ({
    category: String(row?.category ?? "").trim(),
    value: row?.value === "" || row?.value === null || row?.value === undefined ? NaN : Number(row.value),
  })).filter((row) => row.category && Number.isFinite(row.value) && (allowNegative || row.value >= 0));
  const counts = new Map();
  candidates.forEach(({ category }) => {
    const key = category.toLocaleLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return candidates.filter(({ category }) => counts.get(category.toLocaleLowerCase()) === 1);
}
