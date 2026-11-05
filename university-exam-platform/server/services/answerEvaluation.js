function normalizeAnswer(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsPhrase(answer, phrase) {
  const normalizedAnswer = normalizeAnswer(answer);
  const normalizedPhrase = normalizeAnswer(phrase);
  if (!normalizedAnswer || !normalizedPhrase) return false;
  const terms = normalizedPhrase.split(" ");
  // A lone generic word is not evidence of understanding.
  if (terms.length < 2 && normalizedPhrase.length < 9) return false;
  return (` ${normalizedAnswer} `).includes(` ${normalizedPhrase} `);
}

function evaluateObjective(question, response) {
  const unanswered = response === null || response === undefined || response === "";
  if (unanswered) return { marks: 0, method: "server_answer_key", requiresReview: false, rationale: "No answer was submitted." };
  if (question.type === "mcq") {
    const valid = (question.options || []).some((option) => String(option.key) === String(response) || String(option.text) === String(response));
    if (!valid) return { marks: 0, method: "server_answer_key", requiresReview: true, rationale: "Submitted option is not present in the exam snapshot." };
  }
  const correct = normalizeAnswer(response) === normalizeAnswer(question.correctAnswer);
  return { marks: correct ? Number(question.marks) : 0, method: "server_answer_key", requiresReview: false, rationale: correct ? "Response matches the answer key in the published exam snapshot." : "Response does not match the answer key in the published exam snapshot." };
}

function evaluateRubric(question, response) {
  const criteria = question.type === "essay" ? question.rubric || [] : question.markingPoints || [];
  const submitted = typeof response === "string" ? response : "";
  let total = 0;
  const scores = criteria.map((criterion) => {
    const maximum = Number(criterion.marks || 0);
    const phrases = [...new Set([criterion.expectedConcept, criterion.description, ...(criterion.keywords || [])].filter(Boolean))];
    const matchedPhrase = phrases.find((phrase) => containsPhrase(submitted, phrase));
    const marksAwarded = matchedPhrase ? maximum : 0;
    total += marksAwarded;
    return {
      criterion: criterion.description,
      expectedConcept: criterion.expectedConcept || "",
      marksAwarded,
      automaticMarks: marksAwarded,
      maximumMarks: maximum,
      feedback: matchedPhrase ? `Provisional phrase match: “${matchedPhrase}”. Lecturer review is still required.` : "No configured phrase was found. This baseline cannot assess semantic equivalence; lecturer review is required.",
      requiresReview: true,
      matchedPhrase: matchedPhrase || null,
    };
  });
  return { marks: Math.min(Number(question.marks || 0), total), method: "configured_phrase_baseline", requiresReview: true, criterionScores: scores };
}

function evaluateBarChart(question, response) {
  const maximum = Number(question.marks || 0);
  const reference = Array.isArray(question.chartData) ? question.chartData : [];
  const submitted = Array.isArray(response) ? response : [];
  if (!reference.length || !submitted.length) {
    return { marks: 0, method: "bar_chart_reference_comparison", requiresReview: true, rationale: !submitted.length ? "No bar chart data was submitted." : "Reference bar data is unavailable; lecturer review is required." };
  }

  const normalizeCategory = (value) => normalizeAnswer(value);
  const referenceByName = new Map(reference.map((bar) => [normalizeCategory(bar.category), Number(bar.value)]));
  const submittedByName = new Map();
  const invalidNames = new Set();
  for (const bar of submitted) {
    const name = normalizeCategory(bar?.category);
    const value = bar?.value === "" || bar?.value === null || bar?.value === undefined ? NaN : Number(bar.value);
    if (!name || !Number.isFinite(value)) continue;
    if (submittedByName.has(name)) invalidNames.add(name);
    else submittedByName.set(name, value);
  }

  let earnedUnits = 0;
  const correct = [];
  const incorrectValues = [];
  const missing = [];
  for (const [name, expectedValue] of referenceByName) {
    if (!submittedByName.has(name) || invalidNames.has(name)) {
      missing.push(name);
      continue;
    }
    // A category contributes half credit; its value earns the other half only
    // when that value is paired with the matching category.
    earnedUnits += 0.5;
    const actualValue = submittedByName.get(name);
    if (Math.abs(actualValue - expectedValue) <= 1e-9) {
      earnedUnits += 0.5;
      correct.push(name);
    } else {
      incorrectValues.push(name);
    }
  }

  const extra = [...submittedByName.keys()].filter((name) => !referenceByName.has(name) || invalidNames.has(name));
  // Extra entries receive no credit and deduct half of one reference bar's
  // credit each. This penalizes guesses without overpowering correct entries.
  const marks = Math.max(0, Math.min(maximum, maximum * (earnedUnits - 0.5 * extra.length) / reference.length));
  const details = [];
  if (correct.length) details.push(`Correct category and value: ${correct.join(", ")}.`);
  if (incorrectValues.length) details.push(`Correct category with incorrect value: ${incorrectValues.join(", ")}.`);
  if (missing.length) details.push(`Missing or duplicated categories: ${missing.join(", ")}.`);
  if (extra.length) details.push(`Additional or duplicated entries: ${extra.join(", ")}.`);
  if (!details.length) details.push("No submitted entries matched the reference categories.");
  return { marks, method: "bar_chart_reference_comparison", requiresReview: true, rationale: `${details.join(" ")} This is a provisional suggestion; lecturer review is required.` };
}

function evaluateAnswer(question, response) {
  if (["mcq", "true_false"].includes(question.type)) return evaluateObjective(question, response);
  if (question.type === "bar_chart") return evaluateBarChart(question, response);
  return evaluateRubric(question, response);
}

function buildLecturerEvaluation(question, response, input = {}) {
  const suggestion = evaluateAnswer(question, response);
  const maximum = Number(question.marks);
  const criteria = question.type === "essay" ? question.rubric || [] : question.type === "short_answer" ? question.markingPoints || [] : [];
  let criterionScores = [];
  let rubricTotal = null;
  if (criteria.length) {
    if (!Array.isArray(input.criterionScores) || input.criterionScores.length !== criteria.length) throw Object.assign(new Error(`Provide a score for each of the ${criteria.length} rubric criteria.`), { statusCode: 400 });
    rubricTotal = 0;
    criterionScores = criteria.map((criterion, index) => {
      const maximumMarks = Number(criterion.marks);
      const marksAwarded = Number(input.criterionScores[index]?.marksAwarded);
      if (!Number.isFinite(marksAwarded) || marksAwarded < 0 || marksAwarded > maximumMarks) throw Object.assign(new Error(`Criterion ${index + 1} marks must be between 0 and ${maximumMarks}.`), { statusCode: 400 });
      rubricTotal += marksAwarded;
      return { criterion: criterion.description, expectedConcept: criterion.expectedConcept || "", marksAwarded, automaticMarks: Number(suggestion.criterionScores?.[index]?.marksAwarded ?? 0), maximumMarks, feedback: String(input.criterionScores[index]?.feedback || "").slice(0, 1000), requiresReview: Boolean(suggestion.criterionScores?.[index]?.requiresReview), matchedPhrase: suggestion.criterionScores?.[index]?.matchedPhrase || null };
    });
  }
  const override = input.manualOverrideMarks === null || input.manualOverrideMarks === undefined || input.manualOverrideMarks === "" ? null : Number(input.manualOverrideMarks);
  if (!Number.isFinite(maximum) || maximum < 0) throw Object.assign(new Error("Question snapshot maximum marks are invalid."), { statusCode: 400 });
  if (override !== null && (!Number.isFinite(override) || override < 0 || override > maximum)) throw Object.assign(new Error(`Manual marks for this question must be between 0 and ${maximum}.`), { statusCode: 400 });
  const finalMarks = override !== null ? override : rubricTotal !== null ? rubricTotal : suggestion.marks;
  if (!Number.isFinite(finalMarks) || finalMarks < 0 || finalMarks > maximum) throw Object.assign(new Error(`Final marks for this question must be between 0 and ${maximum}.`), { statusCode: 400 });
  return { suggestion, criterionScores, rubricTotal, manualOverrideMarks: override, finalMarks, marksSource: override !== null ? "manual_override" : rubricTotal !== null ? "rubric" : "automatic" };
}

module.exports = { normalizeAnswer, containsPhrase, evaluateObjective, evaluateRubric, evaluateBarChart, evaluateAnswer, buildLecturerEvaluation };
