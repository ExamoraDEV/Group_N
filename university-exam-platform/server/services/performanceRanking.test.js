const test = require("node:test");
const assert = require("node:assert/strict");
const { rankStudents } = require("./performanceRanking");

test("ranks by average percentage, shares ties, and orders tied names consistently", () => {
  const rows = rankStudents([
    { id: "c", name: "Cora", averagePercentage: 80 },
    { id: "b", name: "Ben", averagePercentage: 92 },
    { id: "a", name: "Ada", averagePercentage: 92 },
  ]);
  assert.deepEqual(rows.map((row) => [row.name, row.rank]), [["Ada", 1], ["Ben", 1], ["Cora", 3]]);
});

test("supports raw total marks and name sorting without promoting missing grades", () => {
  const rows = [{ id: "a", name: "A", totalMarks: 4, averagePercentage: null }, { id: "b", name: "B", totalMarks: 9, averagePercentage: 50 }];
  assert.deepEqual(rankStudents(rows, "total").map((row) => row.id), ["b", "a"]);
  assert.deepEqual(rankStudents(rows, "name").map((row) => row.id), ["a", "b"]);
});
