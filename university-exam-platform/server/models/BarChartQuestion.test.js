const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Question = require("./Question");
const Exam = require("./Exam");

const questionData = () => ({
  lecturer: new mongoose.Types.ObjectId(),
  text: "Create a chart from the reference values.",
  type: "bar_chart",
  module: "Statistics",
  marks: 4,
  chartData: [{ category: "A", value: 2 }, { category: "B", value: 4 }],
});

test("Question and exam snapshot schemas accept bar chart questions", async () => {
  await new Question(questionData()).validate();
  assert.ok(Exam.schema.path("questionSnapshots").schema.path("type").enumValues.includes("bar_chart"));
});

test("bar chart schema validation rejects duplicate and disallowed negative reference bars", async () => {
  await assert.rejects(new Question({ ...questionData(), chartData: [{ category: "A", value: 2 }, { category: " a ", value: 4 }] }).validate(), /chartData/);
  await assert.rejects(new Question({ ...questionData(), chartData: [{ category: "A", value: -2 }] }).validate(), /chartData/);
  await new Question({ ...questionData(), allowNegative: true, chartData: [{ category: "A", value: -2 }] }).validate();
});
