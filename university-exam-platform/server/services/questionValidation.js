const TYPES = new Map([
  ["mcq", "mcq"], ["multiple_choice", "mcq"], ["multiple choice", "mcq"],
  ["true_false", "true_false"], ["true/false", "true_false"], ["true / false", "true_false"], ["true false", "true_false"],
  ["short_answer", "short_answer"], ["short answer", "short_answer"],
  ["essay", "essay"], ["essay_structured", "essay"], ["essay / structured", "essay"], ["structured", "essay"],
  ["bar_chart", "bar_chart"], ["bar chart", "bar_chart"], ["bar chart question", "bar_chart"],
]);

function normalizeCriteria(items) {
  if (!Array.isArray(items)) return items;
  return items.map((item = {}) => ({
    ...item,
    description: item.description ?? item.concept ?? item.title ?? item.criterion ?? "",
    expectedConcept: item.expectedConcept ?? item.expected_concept ?? "",
    marks: Number(item.marks),
    keywords: Array.isArray(item.keywords) ? item.keywords : typeof item.keywords === "string" ? item.keywords.split(",").map((word) => word.trim()).filter(Boolean) : [],
  }));
}

function normalizeQuestion(input = {}) {
  const typeInput = String(input.type ?? input.questionType ?? "").trim().toLowerCase();
  const type = TYPES.get(typeInput) || typeInput;
  const answer = input.correctAnswer ?? input.correct_answer ?? input.answerKey;
  const correctAnswer = type === "true_false" && typeof answer === "boolean" ? String(answer) : answer;
  const normalized = {
    ...input,
    text: input.text ?? input.questionText ?? "",
    type,
    module: input.module ?? input.subject ?? "",
    marks: Number(input.marks ?? input.totalMarks),
    correctAnswer,
    options: Array.isArray(input.options) ? input.options.map((option = {}, index) => ({
      ...option,
      key: String(option.key ?? String.fromCharCode(65 + index)),
      text: option.text ?? option.label ?? "",
    })) : input.options,
    markingPoints: normalizeCriteria(input.markingPoints ?? input.criteria),
    rubric: normalizeCriteria(input.rubric ?? input.criteria),
    chartData: Array.isArray(input.chartData) ? input.chartData.map((row = {}) => ({ category: typeof row?.category === "string" ? row.category.trim() : "", value: row?.value === "" || row?.value === null || row?.value === undefined ? NaN : Number(row.value) })) : input.chartData,
    allowNegative: input.allowNegative === true,
  };
  // The form keeps fields from its previous type in React state. Strip those
  // values before Mongoose validates nested required option fields.
  if (type !== "mcq") normalized.options = [];
  if (type !== "mcq" && type !== "true_false") normalized.correctAnswer = "";
  if (type !== "short_answer") normalized.markingPoints = [];
  if (type !== "essay") normalized.rubric = [];
  if (type !== "bar_chart") { normalized.chartData = []; normalized.allowNegative = false; }
  return normalized;
}

function validateQuestion(data) {
  if (typeof data.text !== "string" || !data.text.trim()) return "Question text is required.";
  if (!new Set(["mcq", "true_false", "short_answer", "essay", "bar_chart"]).has(data.type)) return "Select a supported question type.";
  if (typeof data.module !== "string" || !data.module.trim()) return "Module is required.";
  if (!Number.isFinite(data.marks) || data.marks <= 0 || data.marks > 1000) return "Marks must be a positive number (up to 1000).";
  if (data.difficulty && !new Set(["easy", "medium", "hard"]).has(data.difficulty)) return "Select a valid difficulty.";
  if (data.type === "mcq") {
    if (!Array.isArray(data.options) || data.options.length < 2) return "MCQs need at least two answer options.";
    if (data.options.some((option) => !option.key?.trim() || !option.text?.trim()) || new Set(data.options.map((option) => option.key)).size !== data.options.length) return "MCQ option keys must be unique and every option needs text.";
    if (typeof data.correctAnswer !== "string" || data.options.filter((option) => option.key === data.correctAnswer).length !== 1) return "Choose exactly one valid correct option.";
  }
  if (data.type === "true_false" && !["true", "false"].includes(String(data.correctAnswer).toLowerCase())) return "Choose the correct True/False answer.";
  const validCriteria = (items, label) => {
    if (!Array.isArray(items) || !items.length) return `${label} needs at least one criterion.`;
    if (!items.every((item) => item.description.trim() && Number.isFinite(item.marks) && item.marks > 0)) return `${label} criteria need a description and positive marks.`;
    if (Math.abs(items.reduce((sum, item) => sum + item.marks, 0) - data.marks) > 0.001) return `${label} marks must add up to the question total.`;
    return null;
  };
  if (data.type === "short_answer") {
    const error = validCriteria(data.markingPoints, "Short-answer marking");
    if (error) return error;
  }
  if (data.type === "essay") {
    const error = validCriteria(data.rubric, "Essay rubric");
    if (error) return error;
  }
  if (data.type === "bar_chart") {
    if (!Array.isArray(data.chartData) || data.chartData.length < 1 || data.chartData.length > 20) return "Bar chart questions need between 1 and 20 reference bars.";
    const categories = data.chartData.map((row) => row.category.trim().toLocaleLowerCase());
    if (data.chartData.some((row) => !row.category.trim() || row.category.length > 120 || !Number.isFinite(row.value) || (!data.allowNegative && row.value < 0))) return `Enter a category and valid ${data.allowNegative ? "number" : "non-negative number"} for each reference bar.`;
    if (new Set(categories).size !== categories.length) return "Reference bar category names must be unique.";
  }
  return null;
}

module.exports = { normalizeQuestion, validateQuestion };
