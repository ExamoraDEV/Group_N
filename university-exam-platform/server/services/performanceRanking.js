function metricValue(student, metric = "average") {
  return metric === "total" ? Number(student.totalMarks) : Number(student.averagePercentage);
}

function rankStudents(rows = [], metric = "average") {
  const rankedRows = rows.filter((student) => {
    if (metric === "name") return true;
    if (metric === "total") return student.totalMarks !== null && student.totalMarks !== undefined && Number.isFinite(Number(student.totalMarks));
    return student.averagePercentage !== null && student.averagePercentage !== undefined && Number.isFinite(Number(student.averagePercentage));
  });
  const sorted = rankedRows.sort((left, right) => {
    if (metric === "name") return String(left.name || "").localeCompare(String(right.name || "")) || String(left.studentId || left.id).localeCompare(String(right.studentId || right.id));
    return metricValue(right, metric) - metricValue(left, metric) || String(left.name || "").localeCompare(String(right.name || "")) || String(left.id).localeCompare(String(right.id));
  });
  let previousValue;
  let previousRank = 0;
  return sorted.map((student, index) => {
    const value = metricValue(student, metric);
    const same = metric !== "name" && index > 0 && Math.abs(value - previousValue) < 0.000001;
    const rank = same ? previousRank : index + 1;
    previousValue = value;
    previousRank = rank;
    return { ...student, rank };
  });
}

module.exports = { metricValue, rankStudents };
