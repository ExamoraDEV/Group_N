import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle, Check, ChevronLeft, ChevronRight, Clock3, LoaderCircle, ShieldCheck, Flag, CircleCheck, ClipboardList, ArrowLeft, Send, TriangleAlert } from "lucide-react";
import { getStudentAttempt, getStudentExam, saveStudentAnswer, startStudentAttempt, submitStudentAttempt, setStudentQuestionFlag, recordStudentExamActivity } from "../services/studentApi";
import BarChartDataEditor from "../components/BarChartDataEditor";
import { validChartRows } from "../components/barChartUtils";
import "./StudentExam.css";

const hasAnswer = (value, question) => typeof value === "boolean" || (typeof value === "string" && value.trim().length > 0) || (question?.type === "bar_chart" && validChartRows(value, question.allowNegative).length > 0);
const sameAnswer = (left, right) => JSON.stringify(left ?? "") === JSON.stringify(right ?? "");

const clockText = (milliseconds) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

export default function StudentExamPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [instructionsReady, setInstructionsReady] = useState(false);
  const [fullscreenWarning, setFullscreenWarning] = useState(false);
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [flagged, setFlagged] = useState(new Set());
  const [responses, setResponses] = useState({});
  const [savedResponses, setSavedResponses] = useState({});
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [startPending, setStartPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [serverOffset, setServerOffset] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const savedRef = useRef({});
  const expiryCheckRef = useRef(false);
  const startLockRef = useRef(false);
  const saveQueueRef = useRef(Promise.resolve());
  const leaveStateRef = useRef({ dirty: false, saving: false });
  const activeAttempt = attempt?.status === "in_progress";
  const questions = useMemo(() => attempt?.answers || [], [attempt?.answers]);
  const current = questions[index];
  const answeredCount = useMemo(() => questions.filter(({ question }) => hasAnswer(responses[question._id], question)).length, [questions, responses]);
  const flaggedCount = flagged.size;
  const unansweredCount = Math.max(0, questions.length - answeredCount);
  const dirty = useMemo(() => questions.some(({ question }) => !sameAnswer(responses[question._id], savedResponses[question._id])), [questions, responses, savedResponses]);
  useEffect(() => { leaveStateRef.current = { dirty, saving }; }, [dirty, saving]);

  const loadAttempt = useCallback(async () => {
    const detail = await getStudentExam(examId);
    setExam(detail.exam);
    const existingId = detail.exam.attempt?.id || null;
    if (!existingId) { setInstructionsReady(true); return; }
    const payload = await getStudentAttempt(existingId);
    const nextAttempt = payload.attempt;
    const values = Object.fromEntries(nextAttempt.answers.map((answer) => [answer.question._id, answer.response ?? ""]));
    setAttempt(nextAttempt);
    setFlagged(new Set(nextAttempt.flaggedQuestions || []));
    setResponses(values);
    setSavedResponses(values);
    savedRef.current = values;
    setServerOffset(new Date(payload.serverNow).getTime() - Date.now());
    setRemaining(Math.max(0, new Date(nextAttempt.deadlineAt).getTime() - new Date(payload.serverNow).getTime()));
  }, [examId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError("");
      try { await loadAttempt(); }
      catch (loadError) { if (!cancelled) { if (loadError.status === 401) navigate("/signin", { replace: true }); else if (loadError.status === 403) navigate("/student/dashboard", { replace: true }); else setError(loadError.message || "Unable to open this exam."); } }
    })();
    return () => { cancelled = true; };
  }, [loadAttempt, navigate]);

  const beginExam = async () => {
    if (startLockRef.current || activeAttempt) return;
    startLockRef.current = true;
    setStartPending(true);
    let requestedFullscreen = false;
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        requestedFullscreen = Boolean(document.fullscreenElement);
      }
    } catch { /* Fullscreen can be declined; continue with a clear fallback. */ }
    if (!requestedFullscreen) setNotice("Fullscreen is unavailable or was declined. The exam will continue in this browser window.");
    try {
      const started = await startStudentAttempt(examId);
      const payload = await getStudentAttempt(started.attempt.id);
      const nextAttempt = payload.attempt;
      const values = Object.fromEntries(nextAttempt.answers.map((answer) => [answer.question._id, answer.response ?? ""]));
      setAttempt(nextAttempt); setFullscreenActive(Boolean(document.fullscreenElement)); setResponses(values); setSavedResponses(values); savedRef.current = values;
      setFlagged(new Set(nextAttempt.flaggedQuestions || []));
      setServerOffset(new Date(payload.serverNow).getTime() - Date.now());
      setRemaining(Math.max(0, new Date(nextAttempt.deadlineAt).getTime() - new Date(payload.serverNow).getTime()));
      setInstructionsReady(false); setError("");
    } catch (startError) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      setError(startError.message || "Unable to start the exam.");
    } finally { startLockRef.current = false; setStartPending(false); }
  };  const logEvent = useCallback((type) => {
    if (!attempt?.id) return;
    const dedupeKey = `${type}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    recordStudentExamActivity(attempt.id, [{ type, dedupeKey }]).catch(() => {});
  }, [attempt]);
  const toggleFlag = async (questionId) => {
    const nextValue = !flagged.has(questionId);
    setFlagged((previous) => { const next = new Set(previous); nextValue ? next.add(questionId) : next.delete(questionId); return next; });
    try { const result = await setStudentQuestionFlag(attempt.id, questionId, nextValue); setFlagged(new Set(result.flaggedQuestions)); }
    catch (flagError) { setFlagged((previous) => { const next = new Set(previous); nextValue ? next.delete(questionId) : next.add(questionId); return next; }); setError(flagError.message || "Unable to save question flag."); }
  };
  useEffect(() => {
    if (!activeAttempt) return undefined;
    const full = () => { const now = Boolean(document.fullscreenElement); if (fullscreenActive && !now) { setFullscreenWarning(true); logEvent("fullscreen_exit"); } setFullscreenActive(now); };
    const visibility = () => { if (document.visibilityState === "hidden") logEvent("visibility_hidden"); };
    const blur = () => logEvent("window_blur");
    const restricted = (event) => { const editable = event.target.closest("textarea, input, [contenteditable='true']"); if (event.type === "paste" && editable) { event.preventDefault(); logEvent("paste_attempt"); } else { event.preventDefault(); logEvent(event.type === "copy" ? "copy_attempt" : event.type === "cut" ? "cut_attempt" : "context_menu"); } };
    document.addEventListener("fullscreenchange", full); document.addEventListener("visibilitychange", visibility); window.addEventListener("blur", blur);
    const root = document.querySelector(".exam-shell"); ["copy", "cut", "paste", "contextmenu"].forEach((type) => root?.addEventListener(type, restricted));
    const key = (event) => { if ((event.ctrlKey || event.metaKey) && ["c", "x", "v"].includes(event.key.toLowerCase())) { event.preventDefault(); logEvent(({ c:"copy_attempt", x:"cut_attempt", v:"paste_attempt" })[event.key.toLowerCase()]); } };
    window.addEventListener("keydown", key);
    return () => { document.removeEventListener("fullscreenchange", full); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("blur", blur); window.removeEventListener("keydown", key); ["copy", "cut", "paste", "contextmenu"].forEach((type) => root?.removeEventListener(type, restricted)); };
  }, [activeAttempt, fullscreenActive, logEvent]);
  const persistAnswer = useCallback((questionId, value, strict = false) => {
    if (value === undefined || value === null) return;
    const operation = async () => {
      setSaving(true);
      try {
        const result = await saveStudentAnswer(attempt.id, questionId, value);
        const next = { ...savedRef.current, [questionId]: value };
        savedRef.current = next;
        setSavedResponses(next);
        setServerOffset(new Date(result.serverNow).getTime() - Date.now());
        setNotice("Answer saved");
        setError("");
      } catch (saveError) {
        setError(saveError.message || "Unable to save your answer.");
        if (strict) throw saveError;
        if (saveError.status === 409) {
          try { const latest = await getStudentAttempt(attempt.id); setAttempt(latest.attempt); setServerOffset(new Date(latest.serverNow).getTime() - Date.now()); }
          catch { /* Keep the actionable save error on screen. */ }
        }
      } finally { setSaving(false); }
    };
    const queued = saveQueueRef.current.then(operation, operation);
    saveQueueRef.current = queued.catch(() => {});
    return queued;
  }, [attempt]);

  useEffect(() => {
    if (!activeAttempt || submitting) return undefined;
    const timer = window.setTimeout(() => {
      (async () => {
        for (const item of questions) {
          const id = item.question._id;
          const value = responses[id] ?? "";
          if (!sameAnswer(value, savedResponses[id])) await persistAnswer(id, value);
        }
      })();
    }, 650);
    return () => window.clearTimeout(timer);
  }, [activeAttempt, submitting, questions, responses, savedResponses, persistAnswer]);

  useEffect(() => {
    if (!activeAttempt) return undefined;
    const tick = () => {
      const end = new Date(attempt.deadlineAt).getTime();
      const left = Math.max(0, end - (Date.now() + serverOffset));
      setRemaining(left);
      if (left === 0 && !expiryCheckRef.current) {
        expiryCheckRef.current = true;
        getStudentAttempt(attempt.id).then((data) => {
          setAttempt(data.attempt);
          setServerOffset(new Date(data.serverNow).getTime() - Date.now());
          setNotice("Time has ended. Saved answers have been retained and the attempt is closed.");
        }).catch((timerError) => { expiryCheckRef.current = false; setError(timerError.message || "Unable to verify the exam deadline."); });
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [activeAttempt, attempt?.deadlineAt, attempt?.id, serverOffset]);

  useEffect(() => {
    if (!activeAttempt) return undefined;
    const beforeUnload = (event) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [activeAttempt, dirty, saving]);

  useEffect(() => {
    if (!activeAttempt) return undefined;
    const onPopState = () => {
      if ((leaveStateRef.current.dirty || leaveStateRef.current.saving) && !window.confirm("You have answers that may still be saving. Leave the exam page?")) window.history.go(1);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [activeAttempt]);

  const navigateQuestion = async (nextIndex) => {
    if (!activeAttempt || nextIndex < 0 || nextIndex >= questions.length) return;
    if (current && !sameAnswer(responses[current.question._id], savedRef.current[current.question._id])) { try { await persistAnswer(current.question._id, responses[current.question._id] ?? "", true); } catch { return; } }
    setIndex(nextIndex);
  };

  const submit = async () => {
    if (!activeAttempt || submitting) return;
    setSubmitting(true); setError("");
    try {
      for (const item of questions) {
        const id = item.question._id;
        const value = responses[id] ?? "";
        if (!sameAnswer(value, savedRef.current[id])) await persistAnswer(id, value, true);
      }
      const result = await submitStudentAttempt(attempt.id);
      setAttempt((previous) => ({ ...previous, status: result.status, submittedAt: result.submittedAt, evaluationStatus: result.evaluationStatus }));
      setConfirmSubmit(false);
      setNotice("Your submission was received.");
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    } catch (submitError) {
      setError(submitError.message || "Unable to submit your exam.");
      if (submitError.status === 409) {
        try { const latest = await getStudentAttempt(attempt.id); setAttempt(latest.attempt); }
        catch { /* Leave the submission response visible. */ }
      }
    } finally { setSubmitting(false); }
  };

  if (!exam && !error) return <main className="exam-stage exam-loading"><LoaderCircle className="exam-spinner" /><span>Loading your exam…</span></main>;
  if (error && !attempt && !instructionsReady) return <main className="exam-stage exam-loading"><section className="exam-stage-card"><AlertCircle /><h1>Exam unavailable</h1><p>{error}</p><button className="exam-action-secondary" onClick={() => navigate("/student/exams")}>Back to My Exams</button></section></main>;
  if (attempt && attempt.status !== "in_progress") return <main className="exam-stage exam-completion"><section className={`exam-stage-card exam-completion-card ${attempt.status}`}><span className={`exam-completion-icon ${attempt.status}`}>{attempt.status === "submitted" ? <CircleCheck size={30}/> : <TriangleAlert size={28}/>}</span><span className={`exam-state-pill ${attempt.status}`}>{attempt.status === "submitted" ? "SUBMISSION RECORDED" : "ATTEMPT CLOSED"}</span><h1>{attempt.status === "submitted" ? "Exam submitted successfully" : "Exam window ended"}</h1><p className="exam-completion-title">{exam?.title}</p>{attempt.status === "submitted" ? <><p>Your submission has been recorded. Results will be available when they are published.</p>{attempt.submittedAt && <time className="exam-submitted-time">Submitted {new Date(attempt.submittedAt).toLocaleString()}</time>}</> : <p>This attempt was closed at the deadline. Your saved answers were retained.</p>}<button className="exam-action-primary" onClick={() => navigate(attempt.status === "submitted" ? "/student/exams/completed" : "/student/exams/missed")}>Return to My Exams <ChevronRight size={17}/></button></section></main>;

  if (instructionsReady) return <main className="exam-stage exam-entry-page"><div className="exam-entry-wrap"><div className="exam-entry-brand"><span className="exam-brand-mark">E</span><span>EXAMORA<small>EXAM SESSION</small></span></div><section className="exam-entry-hero"><span className="exam-entry-kicker">UNIVERSITY EXAMINATION</span><h1>{exam?.title}</h1><p>{exam?.module}</p><div className="exam-entry-stats"><article><Clock3/><span>Duration</span><strong>{exam?.durationMinutes} minutes</strong></article><article><ClipboardList/><span>Total marks</span><strong>{exam?.totalMarks}</strong></article><article><Check/><span>Questions</span><strong>{exam?.questionCount ?? 0}</strong></article></div></section><div className="exam-entry-details"><section className="exam-entry-info"><h2><ShieldCheck size={18}/> Before you start</h2><ul><li>The timer starts when the server successfully creates or resumes your attempt.</li><li>Your deadline is set by the exam schedule and duration. Refreshing the page will not reset it.</li><li>Answers save automatically as you work. You can revisit questions before submitting.</li><li>Fullscreen and browser copy/paste restrictions are browser-level deterrents. Screenshots and other applications cannot be reliably blocked.</li></ul></section><section className="exam-entry-info exam-instructions"><h2>Exam instructions</h2><p>{exam?.instructions?.trim() || "Read each question carefully and review your answers before submitting."}</p></section></div><div className="exam-entry-footer">{error && <div className="exam-alert" role="alert"><AlertCircle size={17}/>{error}</div>}{notice && <p className="exam-entry-fallback" role="status">{notice}</p>}<button className="exam-action-primary exam-start-button" onClick={beginExam} disabled={startPending}>{startPending ? <><LoaderCircle className="exam-spinner" size={17}/> Starting exam…</> : <>Start Exam <ChevronRight size={18}/></>}</button><span>Available {exam?.startsAt ? new Date(exam.startsAt).toLocaleString() : "now"} · Closes {exam?.endsAt ? new Date(exam.endsAt).toLocaleString() : "as scheduled"}</span></div></div></main>;

  const answerState = (id) => hasAnswer(responses[id], questions.find((item) => item.question._id === id)?.question);
  const questionState = (id) => `${answerState(id) ? "answered" : "unanswered"}${flagged.has(id) ? " flagged" : ""}${answerState(id) && flagged.has(id) ? " answered-flagged" : ""}`;
  const questionLabel = (id, questionIndex) => `Question ${questionIndex + 1}: ${answerState(id) ? "answered" : "not answered"}${flagged.has(id) ? ", flagged for review" : ""}${questionIndex === index ? ", currently selected" : ""}`;
  const openQuestionFromReview = (questionIndex) => { setReviewOpen(false); navigateQuestion(questionIndex); };

  return <main className={`exam-shell ${activeAttempt ? "secure-active" : ""}`} onCopy={(event)=>event.preventDefault()}>
    <header className="exam-header"><div className="exam-brand"><span className="exam-brand-mark">E</span><span>EXAMORA<small>EXAM SESSION</small></span></div><div className="exam-header-title"><strong>{exam?.title}</strong><span>{exam?.module}</span></div><div className={`exam-save-state ${saving || dirty ? "pending" : "saved"}`} aria-live="polite">{saving ? <><LoaderCircle size={15} className="exam-spinner"/>Saving…</> : dirty ? "Unsaved changes" : <><Check size={15}/> {notice || "All answers saved"}</>}</div></header>
    <section className="exam-topline"><div className={`exam-time-card ${remaining <= 60000 ? "critical" : remaining <= 300000 ? "urgent" : ""}`}><span className="exam-clock-icon"><Clock3 size={20}/></span><div><small>TIME REMAINING</small><strong role="timer" aria-label={`${clockText(remaining)} remaining`}>{clockText(remaining)}</strong></div><span className="exam-time-note">Server timed</span></div><div className="exam-progress-card"><div className="exam-progress-label"><span>Question <b>{index + 1}</b> of {questions.length}</span><span>{questions.length ? Math.round(((index + 1) / questions.length) * 100) : 0}%</span></div><div className="exam-progress-track"><i style={{ width: `${questions.length ? ((index + 1) / questions.length) * 100 : 0}%` }}/></div><small>{answeredCount} answered · {unansweredCount} unanswered · {flaggedCount} flagged</small></div></section>
    {error && <div className="exam-alert" role="alert"><AlertCircle size={17}/>{error}</div>}
    <div className="exam-layout"><section className="exam-question-card" aria-labelledby="exam-question-title"><div className="exam-question-meta"><span>QUESTION {String(index + 1).padStart(2,"0")} OF {questions.length}</span><span>{current?.question?.marks} MARKS</span></div><h1 id="exam-question-title">{current?.question?.text}</h1><button type="button" className={`exam-flag-button ${flagged.has(current?.question?._id) ? "is-flagged" : ""}`} aria-pressed={flagged.has(current?.question?._id)} onClick={()=>toggleFlag(current.question._id)}><Flag size={15}/>{flagged.has(current?.question?._id) ? "Flagged for Review" : "Flag for Review"}</button><p className="exam-answer-hint">{current?.question?.type === "bar_chart" ? "Enter your own categories and values to build a chart. Your entries save automatically." : "Select or write your answer below. Your response saves automatically."}</p><div className="exam-answer-controls">{current?.question?.type === "mcq" && current.question.options.map((option) => <label className={`exam-option ${responses[current.question._id] === option.key ? "selected" : ""}`} key={option.key}><input type="radio" name={current.question._id} value={option.key} checked={responses[current.question._id] === option.key} onChange={() => setResponses((previous) => ({ ...previous, [current.question._id]: option.key }))}/><span className="exam-option-key">{option.key}</span><span>{option.text}</span></label>)}{current?.question?.type === "true_false" && ["true", "false"].map((value) => <label className={`exam-option ${String(responses[current.question._id]).toLowerCase() === value ? "selected" : ""}`} key={value}><input type="radio" name={current.question._id} value={value} checked={String(responses[current.question._id]).toLowerCase() === value} onChange={() => setResponses((previous) => ({ ...previous, [current.question._id]: value }))}/><span className="exam-option-key">{value === "true" ? "T" : "F"}</span><span>{value === "true" ? "True" : "False"}</span></label>)}{["short_answer","essay"].includes(current?.question?.type) && <textarea className={`exam-text-answer ${current.question.type === "essay" ? "essay" : ""}`} aria-label="Your answer" placeholder="Type your answer here…" value={responses[current.question._id] ?? ""} onChange={(event) => setResponses((previous) => ({ ...previous, [current.question._id]: event.target.value }))} />}{current?.question?.type === "bar_chart" && <BarChartDataEditor student rows={Array.isArray(responses[current.question._id]) ? responses[current.question._id] : []} allowNegative={current.question.allowNegative} onChange={(rows) => setResponses((previous) => ({ ...previous, [current.question._id]: rows }))} />}</div><div className="exam-question-footer"><button className="exam-nav-button" disabled={index === 0 || saving} onClick={() => navigateQuestion(index - 1)}><ChevronLeft size={17}/>Previous Question</button><span>{notice || (dirty ? "Saving your response…" : "Your answers are saved automatically")}</span>{index < questions.length - 1 ? <button className="exam-nav-button primary" disabled={saving} onClick={() => navigateQuestion(index + 1)}>Next Question<ChevronRight size={17}/></button> : <button className="exam-nav-button primary" disabled={saving} onClick={() => setReviewOpen(true)}>Review and Submit<ChevronRight size={17}/></button>}</div></section>
      <aside className="exam-question-nav"><div className="exam-nav-heading"><strong>Question map</strong><span>{answeredCount}/{questions.length} answered</span></div><div className="exam-question-grid">{questions.map((item, questionIndex) => { const id = item.question._id; return <button type="button" key={id} className={`${questionState(id)} ${questionIndex === index ? "current" : ""}`} aria-label={questionLabel(id, questionIndex)} aria-current={questionIndex === index ? "step" : undefined} title={questionLabel(id, questionIndex)} onClick={() => navigateQuestion(questionIndex)}>{flagged.has(id) && <Flag size={12} aria-hidden="true"/>}<span>{questionIndex + 1}</span></button>; })}</div><div className="exam-status-legend" aria-label="Question status legend"><span><i className="legend-answered"/>Answered</span><span><i className="legend-flagged"/>Flagged for review</span><span><i className="legend-neutral"/>Not answered</span><span><i className="legend-both"/>Answered + flagged</span><span><i className="legend-selected"/>Current question</span></div><div className="exam-integrity-note"><ShieldCheck size={17}/><span>Flags help you return to questions. They do not affect marks.</span></div><button className="exam-submit-button" disabled={submitting || saving} onClick={() => setReviewOpen(true)}>{submitting ? "Submitting…" : "Review and Submit"}</button></aside>
    </div>
    {fullscreenWarning && <div className="exam-warning" role="alert"><strong>Fullscreen was exited</strong><span>Your exam remains active. This event is recorded for lecturer review and does not change your marks or attempt status.</span><button onClick={()=>setFullscreenWarning(false)}>Dismiss</button><button onClick={async()=>{try{await document.documentElement.requestFullscreen();setFullscreenWarning(false)}catch{setNotice("Fullscreen could not be activated. You may continue in the current window.")}}}>Return to fullscreen</button></div>}
    {reviewOpen && <div className="exam-confirm-backdrop" role="presentation"><section className="exam-review-dialog" role="dialog" aria-modal="true" aria-labelledby="exam-review-title"><div className="exam-dialog-heading"><span className="exam-review-icon"><ClipboardList size={20}/></span><div><h2 id="exam-review-title">Review your answers</h2><p>Check unanswered and flagged questions before submitting.</p></div><button className="exam-dialog-close" aria-label="Close review" onClick={()=>setReviewOpen(false)}>×</button></div><div className="exam-review-stats"><div><strong>{questions.length}</strong><span>Total questions</span></div><div className="answered"><strong>{answeredCount}</strong><span>Answered</span></div><div className="unanswered"><strong>{unansweredCount}</strong><span>Unanswered</span></div><div className="flagged"><strong>{flaggedCount}</strong><span>Flagged</span></div></div>{unansweredCount > 0 && <p className="exam-review-warning"><TriangleAlert size={16}/> {unansweredCount} question{unansweredCount===1?" is":"s are"} unanswered. You can still review them below.</p>}<p className="exam-review-note">Flagged questions are marked for your review; a flag does not mean the question is unanswered.</p><div className="exam-question-grid exam-review-grid">{questions.map((item, questionIndex)=>{const id=item.question._id;return <button type="button" key={id} className={`${questionState(id)} ${questionIndex===index?"current":""}`} aria-label={questionLabel(id,questionIndex)} title={questionLabel(id,questionIndex)} onClick={()=>openQuestionFromReview(questionIndex)}>{flagged.has(id)&&<Flag size={12} aria-hidden="true"/>}<span>{questionIndex+1}</span></button>;})}</div><div className="exam-review-actions"><button className="exam-action-secondary" onClick={()=>setReviewOpen(false)}><ArrowLeft size={16}/> Continue exam</button><button className="exam-action-primary" disabled={submitting || saving} onClick={()=>{setReviewOpen(false);setConfirmSubmit(true)}}><Send size={16}/> Submit Exam</button></div></section></div>}
    {confirmSubmit && <div className="exam-confirm-backdrop" role="presentation"><section className="exam-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-exam-title"><h2 id="confirm-exam-title">Submit this exam?</h2>{error && <p className="exam-submit-error" role="alert">{error}</p>}<p>You have answered {answeredCount} of {questions.length} questions. {unansweredCount > 0 ? `${unansweredCount} remain unanswered. ` : ""}After submission you cannot change your answers.</p><p className="exam-review-note">You have flagged {flaggedCount} question{flaggedCount===1?"":"s"} for review. Submission may be irreversible.</p><div><button className="exam-nav-button" onClick={() => setConfirmSubmit(false)}>Keep working</button><button className="exam-submit-button" disabled={submitting || saving} onClick={submit}>{submitting ? "Submitting…" : "Confirm submission"}</button></div></section></div>}
  </main>;}
