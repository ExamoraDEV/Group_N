function normalizeBarResponse(value, allowNegative = false, { submitting = false } = {}) {
  if (value === null || value === undefined || value === "") return { data: null, error: null };
  if (!Array.isArray(value) || value.length > 20) return { data: null, error: "A bar chart answer may contain at most 20 bars." };
  const data = [];
  const categories = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    if (!row || typeof row !== "object" || Array.isArray(row) || typeof row.category !== "string" || row.category.length > 120 || !["string", "number"].includes(typeof row.value)) return { data: null, error: `Bar ${index + 1} has invalid data.` };
    const category = row.category.trim();
    const valueInput = typeof row.value === "string" ? row.value.trim() : row.value;
    const rawValue = valueInput === "" ? "" : Number(valueInput);
    const valueIsBlank = rawValue === "";
    if (!valueIsBlank && (!Number.isFinite(rawValue) || (!allowNegative && rawValue < 0))) return { data: null, error: `Bar ${index + 1} must have a valid ${allowNegative ? "number" : "non-negative number"}.` };
    if (submitting && (!category || valueIsBlank)) return { data: null, error: `Complete or remove bar ${index + 1} before submitting.` };
    const key = category.toLocaleLowerCase();
    if (submitting && categories.has(key)) return { data: null, error: "Bar category names must be unique." };
    if (category) categories.add(key);
    data.push({ category, value: valueIsBlank ? "" : rawValue });
  }
  return { data, error: null };
}

module.exports = { normalizeBarResponse };
