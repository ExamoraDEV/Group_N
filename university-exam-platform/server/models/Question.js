const mongoose = require("mongoose");

const optionSchema = new mongoose.Schema({ text: { type: String, required: true, trim: true, maxlength: 500 }, key: { type: String, required: true, trim: true, maxlength: 8 } }, { _id: false });
const pointSchema = new mongoose.Schema({ description: { type: String, required: true, trim: true, maxlength: 1000 }, expectedConcept: { type: String, default: "", trim: true, maxlength: 2000 }, keywords: { type: [String], default: [] }, marks: { type: Number, required: true, min: 0 }, explanation: { type: String, default: "", trim: true, maxlength: 2000 } });
const chartDataSchema = new mongoose.Schema({ category: { type: String, required: true, trim: true, maxlength: 120 }, value: { type: Number, required: true } }, { _id: false });
const questionSchema = new mongoose.Schema({
  lecturer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  text: { type: String, required: true, trim: true, maxlength: 10000 },
  type: { type: String, enum: ["mcq", "true_false", "short_answer", "essay", "bar_chart"], required: true },
  module: { type: String, required: true, trim: true, maxlength: 120 }, topic: { type: String, default: "", trim: true, maxlength: 120 },
  difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" }, marks: { type: Number, required: true, min: 0.5, max: 1000 },
  options: { type: [optionSchema], default: [] }, correctAnswer: { type: String, default: "", trim: true, maxlength: 2000 },
  expectedAnswer: { type: String, default: "", trim: true, maxlength: 5000 }, markingPoints: { type: [pointSchema], default: [] },
  modelAnswer: { type: String, default: "", trim: true, maxlength: 10000 }, rubric: { type: [pointSchema], default: [] },
  chartData: { type: [chartDataSchema], default: [] }, allowNegative: { type: Boolean, default: false },
  markingGuide: { type: String, default: "", trim: true, maxlength: 5000 }, explanation: { type: String, default: "", trim: true, maxlength: 5000 },
}, { timestamps: true });
questionSchema.pre("validate", function validateQuestionIntegrity() {
  const criteria = this.type === "short_answer" ? this.markingPoints : this.type === "essay" ? this.rubric : null;
  if (this.type === "mcq") {
    if (!Array.isArray(this.options) || this.options.length < 2) this.invalidate("options", "MCQs require at least two answer options.");
    if (!this.options?.some((option) => option.key === this.correctAnswer)) this.invalidate("correctAnswer", "Select one of the available options.");
    if (this.options?.some((option) => !option.text?.trim()) || new Set((this.options || []).map((option) => option.key)).size !== (this.options || []).length) this.invalidate("options", "MCQ options need non-empty text and unique keys.");
  }
  if (this.type === "true_false" && !["true", "false"].includes(String(this.correctAnswer).toLowerCase())) this.invalidate("correctAnswer", "True/False questions require a valid answer.");
  if (this.type === "bar_chart") {
    const rows = this.chartData || [];
    if (!rows.length || rows.length > 20) this.invalidate("chartData", "Bar chart questions need between 1 and 20 reference bars.");
    const names = rows.map((row) => String(row.category || "").trim().toLocaleLowerCase());
    if (rows.some((row) => !String(row.category || "").trim() || !Number.isFinite(Number(row.value)) || (!this.allowNegative && Number(row.value) < 0)) || new Set(names).size !== names.length) this.invalidate("chartData", "Reference bars need unique category names and valid values for this chart.");
  }
  if (criteria) {
    if (!criteria.length) this.invalidate(this.type === "short_answer" ? "markingPoints" : "rubric", "Add at least one marking criterion.");
    if (criteria.some((item) => !item.description?.trim() || !Number.isFinite(Number(item.marks)) || Number(item.marks) <= 0)) this.invalidate(this.type === "short_answer" ? "markingPoints" : "rubric", "Each criterion needs a description and positive marks.");
    const sum = criteria.reduce((total, item) => total + Number(item.marks || 0), 0);
    if (Math.abs(sum - Number(this.marks)) > 0.001) this.invalidate(this.type === "short_answer" ? "markingPoints" : "rubric", "Criterion marks must add up to the question total.");
  }
});
questionSchema.index({ lecturer: 1, module: 1, type: 1 });
module.exports = mongoose.model("Question", questionSchema);
