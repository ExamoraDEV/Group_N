import { Plus, Trash2 } from "lucide-react";
import BarChart from "./BarChart";
import { validChartRows } from "./barChartUtils";
import "./BarChartDataEditor.css";

const newRow = () => ({ _uiKey: globalThis.crypto?.randomUUID?.() || `bar-${Date.now()}-${Math.random()}`, category: "", value: "" });

export default function BarChartDataEditor({ rows = [], onChange, allowNegative = false, student = false, readOnly = false }) {
  const chartRows = validChartRows(rows, allowNegative);
  const duplicateNames = new Set(rows.map((row) => String(row.category || "").trim().toLocaleLowerCase()).filter(Boolean).filter((name, index, all) => all.indexOf(name) !== index));
  const change = (index, field, value) => onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  const remove = (index) => onChange(rows.filter((_, rowIndex) => rowIndex !== index));
  return <section className={`bar-question-builder ${student ? "student-bar-builder" : "lecturer-bar-builder"}`}>
    <div className="bar-question-builder-heading"><div><h3>{student ? "Build Your Bar Chart" : "Bar chart data"}</h3><p>{student ? "Add up to 20 categories and values. The chart updates as you work." : "Enter the reference categories and values students will chart."}</p></div><span>{chartRows.length} valid bar{chartRows.length === 1 ? "" : "s"}</span></div>
    <div className="bar-question-builder-layout"><div className="bar-data-entry">
      <div className="bar-data-table" role="table" aria-label={student ? "Your bar chart data" : "Reference bar chart data"}>
        <div className="bar-data-row bar-data-header" role="row"><span role="columnheader">Bar name / category</span><span role="columnheader">Value</span><span role="columnheader">Action</span></div>
        {rows.map((row, index) => {
          const duplicate = duplicateNames.has(String(row.category || "").trim().toLocaleLowerCase());
          return <div className="bar-data-row" role="row" key={row._uiKey || row._id || `${row.category}-${index}`}>
            <label className="bar-data-category"><span className="sr-only">Bar name / category {index + 1}</span><input maxLength={120} value={row.category || ""} placeholder="e.g. Colombo" disabled={readOnly} onChange={(event) => change(index, "category", event.target.value)} aria-invalid={duplicate}/></label>
            <label><span className="sr-only">Value for {row.category || `bar ${index + 1}`}</span><input type="number" step="any" min={allowNegative ? undefined : 0} value={row.value ?? ""} placeholder="0" disabled={readOnly} onChange={(event) => change(index, "value", event.target.value)} /></label>
            <button type="button" className="bar-data-remove" onClick={() => remove(index)} disabled={readOnly} aria-label={`Remove bar ${row.category || index + 1}`} title="Remove bar"><Trash2 size={15}/></button>
            {duplicate && <small className="bar-data-error">Use a unique category name.</small>}
          </div>;
        })}
        {!rows.length && <p className="bar-data-empty">No bars added yet. Add a category and value to get started.</p>}
      </div>
      {rows.some((row) => (row.category?.trim() || row.value !== "") && (!row.category?.trim() || row.value === "" || !Number.isFinite(Number(row.value)) || (!allowNegative && Number(row.value) < 0))) && <p className="bar-data-error" role="status">Complete each row with a unique category and valid {allowNegative ? "number" : "non-negative number"}; incomplete or invalid rows are not shown on the chart.</p>}
      {(!readOnly || student) && <button type="button" className="bar-data-add" disabled={readOnly || rows.length >= 20} onClick={() => onChange([...rows, newRow()])}><Plus size={16}/> Add Bar</button>}
    </div><div className="bar-question-chart"><div className="bar-question-chart-heading"><strong>Live chart preview</strong><span>Updates automatically</span></div><BarChart rows={rows} allowNegative={allowNegative} title="Student bar chart preview"/></div></div>
  </section>;
}
