const test = require("node:test");
const assert = require("node:assert/strict");
const { containsPhrase, evaluateObjective, evaluateRubric, buildLecturerEvaluation } = require("./answerEvaluation");

test("MCQ evaluation awards configured marks only for an available correct option", () => {
  const question = { type: "mcq", marks: 2, correctAnswer: "B", options: [{ key: "A", text: "Java" }, { key: "B", text: "JavaScript" }] };
  assert.equal(evaluateObjective(question, "B").marks, 2);
  assert.equal(evaluateObjective(question, "A").marks, 0);
  assert.equal(evaluateObjective(question, "X").requiresReview, true);
});

test("True/False distinguishes boolean false from no response", () => {
  const question = { type: "true_false", marks: 1, correctAnswer: "false" };
  assert.equal(evaluateObjective(question, false).marks, 1);
  assert.equal(evaluateObjective(question, true).marks, 0);
  assert.equal(evaluateObjective(question, null).marks, 0);
  assert.equal(evaluateObjective(question, null).rationale, "No answer was submitted.");
});

test("bar chart comparison awards full credit for matching category/value pairs", () => {
  const q = { type: "bar_chart", marks: 4, chartData: [{ category: "North", value: 2 }, { category: "South", value: 4 }] };
  const suggestion = require("./answerEvaluation").evaluateAnswer(q, [{ category: "North", value: 2 }, { category: "South", value: 4 }]);
  assert.equal(suggestion.marks, 4);
  assert.equal(suggestion.requiresReview, true);
  assert.equal(suggestion.method, "bar_chart_reference_comparison");
  assert.equal(buildLecturerEvaluation(q, [], { manualOverrideMarks: 3 }).finalMarks, 3);
});

test("bar chart comparison gives partial credit for a right category with a wrong value", () => {
  const q = { type: "bar_chart", marks: 4, chartData: [{ category: "North", value: 2 }, { category: "South", value: 4 }] };
  assert.equal(require("./answerEvaluation").evaluateAnswer(q, [{ category: "North", value: 9 }]).marks, 1);
});

test("bar chart comparison does not match values assigned to the wrong category", () => {
  const q = { type: "bar_chart", marks: 4, chartData: [{ category: "North", value: 2 }, { category: "South", value: 4 }] };
  const result = require("./answerEvaluation").evaluateAnswer(q, [{ category: "East", value: 2 }, { category: "West", value: 4 }]);
  assert.equal(result.marks, 0);
  assert.match(result.rationale, /Missing or duplicated categories/);
  assert.match(result.rationale, /Additional or duplicated entries/);
});

test("bar chart comparison handles missing entries and penalizes extras within mark bounds", () => {
  const q = { type: "bar_chart", marks: 4, chartData: [{ category: "North", value: 2 }, { category: "South", value: 4 }] };
  const evaluate = require("./answerEvaluation").evaluateAnswer;
  assert.equal(evaluate(q, [{ category: "North", value: 2 }]).marks, 2);
  assert.equal(evaluate(q, [{ category: "North", value: 2 }, { category: "South", value: 4 }, { category: "Extra", value: 100 }]).marks, 3);
  assert.equal(evaluate({ ...q, marks: 1 }, [{ category: "North", value: 2 }, { category: "South", value: 4 }, { category: "Extra", value: 1000 }, { category: "Other", value: -1 }]).marks, 0.5);
});

test("bar chart comparison gives no marks for empty, invalid, or duplicate entries", () => {
  const q = { type: "bar_chart", marks: 4, chartData: [{ category: "North", value: 2 }] };
  const evaluate = require("./answerEvaluation").evaluateAnswer;
  assert.equal(evaluate(q, []).marks, 0);
  assert.equal(evaluate(q, [{ category: "", value: 2 }]).marks, 0);
  assert.equal(evaluate(q, [{ category: "North", value: "bad" }]).marks, 0);
  assert.equal(evaluate(q, [{ category: "North", value: 2 }, { category: "north", value: 2 }]).marks, 0);
});

test("automatic suggestions are effective marks by default and explicit overall overrides take priority", () => {
  const { evaluateAnswer } = require("./answerEvaluation");
  const questions = [
    [{ type: "mcq", marks: 2, correctAnswer: "B", options: [{ key: "B", text: "Right" }] }, "B"],
    [{ type: "true_false", marks: 1, correctAnswer: "false" }, false],
    [{ type: "bar_chart", marks: 4, chartData: [{ category: "North", value: 2 }] }, [{ category: "North", value: 2 }]],
  ];
  for (const [question, response] of questions) {
    const suggested = evaluateAnswer(question, response).marks;
    const automatic = buildLecturerEvaluation(question, response, {}).finalMarks;
    assert.equal(automatic, suggested);
    assert.equal(buildLecturerEvaluation(question, response, { manualOverrideMarks: 0 }).finalMarks, 0);
  }
});

test("rubric evaluation uses each configured criterion and caps each score", () => {
  const question = { type: "short_answer", marks: 3, markingPoints: [
    { description: "Reduce data redundancy", expectedConcept: "", keywords: ["duplicate data"], marks: 1 },
    { description: "Improve data consistency", expectedConcept: "", keywords: ["consistent data"], marks: 1 },
    { description: "Prevent data anomalies", expectedConcept: "", keywords: ["update anomalies"], marks: 1 },
  ] };
  const result = evaluateRubric(question, "Normalization reduces duplicate data and improves consistent data.");
  assert.equal(result.marks, 2);
  assert.deepEqual(result.criterionScores.map((score) => score.marksAwarded), [1, 1, 0]);
  assert.ok(result.criterionScores.every((score) => score.marksAwarded <= score.maximumMarks));
  assert.ok(result.criterionScores.every((score) => score.requiresReview));
  assert.equal(result.method, "configured_phrase_baseline");
});

test("a single generic matching keyword is not enough to award rubric marks", () => {
  assert.equal(containsPhrase("The database is fast", "database"), false);
});

test("essay criteria use the published rubric and flag baseline as provisional review", () => {
  const result = evaluateRubric({ type: "essay", marks: 2, rubric: [
    { description: "Presentation layer", expectedConcept: "User interface layer", keywords: ["user interface"], marks: 2 },
  ] }, "The user interface layer displays content.");
  assert.equal(result.marks, 2);
  assert.equal(result.criterionScores[0].maximumMarks, 2);
  assert.equal(result.criterionScores[0].requiresReview, true);
});

test("lecturer criterion changes recalculate total and manual overall override takes precedence", () => {
  const q = { type: "short_answer", marks: 3, markingPoints: [{ description: "Reduce duplicate data", keywords: [], marks: 1 }, { description: "Improve consistent data", keywords: [], marks: 2 }] };
  const input = { criterionScores: [{ marksAwarded: 0, feedback: "" }, { marksAwarded: 1.5, feedback: "partial" }] };
  const rubric = buildLecturerEvaluation(q, "", input);
  assert.equal(rubric.rubricTotal, 1.5);
  assert.equal(rubric.finalMarks, 1.5);
  assert.equal(rubric.marksSource, "rubric");
  const overridden = buildLecturerEvaluation(q, "", { ...input, manualOverrideMarks: 2.25 });
  assert.equal(overridden.rubricTotal, 1.5);
  assert.equal(overridden.finalMarks, 2.25);
  assert.equal(overridden.marksSource, "manual_override");
});

test("rubric criterion and overall override marks are bounded by configured maxima", () => {
  const q = { type: "essay", marks: 2, rubric: [{ description: "Data layer", marks: 2 }] };
  assert.throws(() => buildLecturerEvaluation(q, "", { criterionScores: [{ marksAwarded: 2.5 }] }), /between 0 and 2/);
  assert.throws(() => buildLecturerEvaluation(q, "", { criterionScores: [{ marksAwarded: 1 }], manualOverrideMarks: 3 }), /between 0 and 2/);
});
