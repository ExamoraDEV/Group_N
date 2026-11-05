const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeQuestion, validateQuestion } = require("./questionValidation");

const validBase = { text: "Question?", module: "Databases", difficulty: "medium", marks: 2 };

test("normalizes True/False payload fields and boolean answer", () => {
  const question = normalizeQuestion({ ...validBase, questionType: "True / False", correctAnswer: false, options: [{ key: "A", text: "" }, { key: "B", text: "" }] });
  assert.equal(question.type, "true_false");
  assert.equal(question.correctAnswer, "false");
  assert.deepEqual(question.options, []);
  assert.equal(validateQuestion(question), null);
});

test("normalizes short answer criteria and validates exact marks", () => {
  const question = normalizeQuestion({ ...validBase, type: "short_answer", expectedAnswer: "Two reasons", criteria: [
    { concept: "Less duplication", expected_concept: "Redundancy is reduced", marks: "1" },
    { description: "More consistency", marks: "1" },
  ] });
  assert.equal(question.markingPoints[0].description, "Less duplication");
  assert.equal(question.markingPoints[0].expectedConcept, "Redundancy is reduced");
  assert.equal(validateQuestion(question), null);
  assert.match(validateQuestion({ ...question, marks: 3 }), /add up/);
});

test("validates essay rubric and keeps MCQ support", () => {
  const essay = normalizeQuestion({ ...validBase, type: "Essay / Structured", rubric: [{ title: "Layer explanation", expectedConcept: "Business logic", marks: "2" }] });
  assert.equal(essay.type, "essay");
  assert.equal(validateQuestion(essay), null);
  const mcq = normalizeQuestion({ ...validBase, type: "mcq", options: [{ text: "A" }, { text: "B" }], correctAnswer: "B" });
  assert.equal(validateQuestion(mcq), null);
});

test("validates bar chart reference data, uniqueness, and configured negative values", () => {
  const chart = normalizeQuestion({ ...validBase, type: "Bar Chart Question", chartData: [{ category: "North", value: "4" }, { category: "South", value: "0" }] });
  assert.equal(chart.type, "bar_chart");
  assert.deepEqual(chart.chartData.map((row) => row.value), [4, 0]);
  assert.equal(validateQuestion(chart), null);
  assert.match(validateQuestion({ ...chart, chartData: [...chart.chartData, { category: "north", value: 2 }] }), /unique/);
  assert.match(validateQuestion({ ...chart, chartData: [{ category: "North", value: -1 }] }), /non-negative/);
  assert.equal(validateQuestion({ ...chart, allowNegative: true, chartData: [{ category: "North", value: -1 }] }), null);
});
