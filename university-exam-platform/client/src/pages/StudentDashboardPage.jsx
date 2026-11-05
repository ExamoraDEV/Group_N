import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  ChartColumn,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileCheck2,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Printer,
  Search,
  Settings,
  SlidersHorizontal,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import ProgressLineChart from "../components/ProgressLineChart";
import Toast from "../components/Toast";
import {
  getStudentAnalytics,
  getStudentDashboard,
  changeStudentPassword,
  getStudentExam,
  getStudentExams,
  getStudentNotifications,
  getStudentProfile,
  getStudentResults,
  logoutStudent,
  markAllStudentNotificationsRead,
  markStudentNotificationRead,
  updateStudentProfile,
} from "../services/studentApi";

const navigation = [
  { label: "Dashboard", path: "/student/dashboard", view: "dashboard", icon: LayoutDashboard },
  { label: "My Exams", path: "/student/exams", view: "exams", status: "all", icon: BookOpen },
  { label: "Available Exams", path: "/student/exams/available", view: "exams", status: "available", icon: CalendarDays },
  { label: "Upcoming Exams", path: "/student/exams/upcoming", view: "exams", status: "upcoming", icon: Clock3 },
  { label: "Ongoing Exams", path: "/student/exams/ongoing", view: "exams", status: "ongoing", icon: ArrowRight },
  { label: "Completed Exams", path: "/student/exams/completed", view: "exams", status: "completed", icon: CheckCircle2 },
  { label: "Missed Exams", path: "/student/exams/missed", view: "exams", status: "missed", icon: AlertCircle },
  { label: "Results & Grades", path: "/student/results", view: "results", icon: FileCheck2 },
  { label: "Performance", path: "/student/performance", view: "analytics", icon: ChartColumn },
  { label: "Notifications", path: "/student/notifications", view: "notifications", icon: Bell },
  { label: "My Profile", path: "/student/profile", view: "profile", icon: UserRound },
  { label: "Settings", path: "/student/settings", view: "settings", icon: Settings },
];

const examFilters = ["all", "available", "upcoming", "ongoing", "completed", "missed"];
const examFilterPaths = {
  all: "/student/exams",
  available: "/student/exams/available",
  upcoming: "/student/exams/upcoming",
  ongoing: "/student/exams/ongoing",
  completed: "/student/exams/completed",
  missed: "/student/exams/missed",
};
const UNIVERSITY_TIME_ZONE = import.meta.env.VITE_UNIVERSITY_TIMEZONE || "Asia/Colombo";

function formatDate(value, options = { dateStyle: "medium", timeStyle: "short" }) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { ...options, timeZone: UNIVERSITY_TIME_ZONE }).format(date);
}

function EmptyState({ title, detail, icon: Icon = BookOpen }) {
  return (
    <div className="student-empty-state">
      <span className="student-empty-icon"><Icon size={20} aria-hidden="true" /></span>
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}

function StudentLoadingState() {
  return <section className="student-skeleton-view" role="status" aria-label="Loading student portal">
    <span className="sr-only">Loading your student portal…</span>
    <div className="student-skeleton-hero"><i /><i /><i /></div>
    <div className="student-skeleton-cards">{Array.from({ length: 6 }, (_, index) => <div className="student-skeleton-card" key={index}><i /><i /><i /></div>)}</div>
    <div className="student-skeleton-panels"><div /><div /></div>
  </section>;
}

function ExamStatus({ status }) {
  const label = (status || "unknown").replaceAll("_", " ");
  return <span className={`student-status status-${status || "unknown"}`}>{label}</span>;
}

function RemainingTime({ deadline, label = "remaining" }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(deadline).getTime() - Date.now()));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining(Math.max(0, new Date(deadline).getTime() - Date.now()));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return <span className="student-remaining-time">{hours ? `${hours}h ` : ""}{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")} {label}</span>;
}

function ExamCard({ exam, onDetails, onResult }) {
  const navigate = useNavigate();
  const actionLabel = exam.attempt?.status === "in_progress" ? "Continue Exam" : "Start Exam";
  const actionVisible = exam.status === "ongoing";

  return (
    <article className="student-exam-card">
      <div className="student-exam-card-head">
        <span className="student-exam-icon"><BookOpen size={18} aria-hidden="true" /></span>
        <ExamStatus status={exam.status} />
      </div>
      <p className="student-exam-module">{exam.module || "Module not set"}</p>
      <h3>{exam.title}</h3>
      <div className="student-exam-facts">
        <span><CalendarDays size={14} aria-hidden="true" />{formatDate(exam.startsAt)}</span>
        <span><Clock3 size={14} aria-hidden="true" />{exam.durationMinutes} min</span>
        <span><FileCheck2 size={14} aria-hidden="true" />{exam.totalMarks} marks</span>
        <span><FileCheck2 size={14} aria-hidden="true" />{exam.questionCount || 0} questions</span>
      </div>
      {exam.status === "ongoing" && exam.attempt?.deadlineAt && <RemainingTime deadline={exam.attempt.deadlineAt} label="remaining" />}
      {exam.status === "upcoming" && exam.startsAt && <RemainingTime deadline={exam.startsAt} label="until start" />}
      {exam.status === "completed" && <p className="student-exam-result-note">Submitted {formatDate(exam.submissionDate || exam.attempt?.submittedAt)} · {exam.marksAwarded != null ? `${exam.marksAwarded}/${exam.maximumMarks} marks` : exam.resultPublished ? "Result released" : "Awaiting result release"}</p>}
      {exam.status === "missed" && <p className="student-exam-result-note">MISSED EXAM · {exam.missedReason || "The exam window closed without a submission."}</p>}
      <p className="student-exam-lecturer">{exam.lecturer ? `Lecturer: ${exam.lecturer}` : "Lecturer details unavailable"}</p>
      <div className="student-exam-actions">
        <button type="button" className="student-text-button" onClick={() => onDetails(exam.id)}>
          View details <ArrowRight size={14} aria-hidden="true" />
        </button>
        {actionVisible && (
          <button
            type="button"
            className="student-start-button"
            onClick={() => navigate(`/student/exams/${exam.id}/attempt`)}
            title="Open the dedicated examination page."
          >
            {actionLabel}
          </button>
        )}
        {exam.status === "completed" && exam.resultPublished && (
          <button type="button" className="student-text-button" onClick={() => onResult?.(exam.id)}>
            View result <ArrowRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  );
}

function SummaryCard({ label, value, detail, icon: Icon, tone, to }) {
  const content = <>
      <div className="student-summary-top">
        <span>{label}</span>
        <Icon size={17} aria-hidden="true" />
      </div>
      <strong>{value ?? "—"}</strong>
      <small>{detail}</small>
    </>;
  return to
    ? <Link to={to} className={`student-summary-card ${tone}`}>{content}</Link>
    : <article className={`student-summary-card ${tone}`}>{content}</article>;
}

function StudentDashboardPage({ theme, onToggleTheme }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { setAuthenticatedUser } = useAuth();
  const pathParts = location.pathname.split("/").filter(Boolean);
  const query = new URLSearchParams(location.search);
  const pageRoute = pathParts[1] || "";
  const routeExamStatus = pathParts[2] || query.get("status") || "all";
  const isDashboardRoute = pageRoute === "dashboard" && pathParts.length === 2;
  const isRootStudentRoute = !pageRoute && pathParts.length === 1;
  const isExamRoute = pageRoute === "exams" && pathParts.length <= 3;
  const examStatus = isExamRoute && examFilters.includes(routeExamStatus) ? routeExamStatus : "all";
  const view = isDashboardRoute || isRootStudentRoute
    ? "dashboard"
    : isExamRoute && examFilters.includes(routeExamStatus)
      ? "exams"
      : pathParts.length === 2
      ? ({ results: "results", performance: "analytics", analytics: "analytics", notifications: "notifications", profile: "profile", settings: "settings" }[pageRoute] || "not-found")
        : "not-found";
  const pageNumber = Math.max(1, Number.parseInt(query.get("page") || "1", 10) || 1);
  const searchQuery = query.get("search") || "";
  const moduleFilter = query.get("module") || "";
  const sortOrder = query.get("sort") || (view === "results" ? "published_desc" : examStatus === "completed" ? "date_desc" : "date_asc");
  const notificationType = query.get("type") || "";

  const [profile, setProfile] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [viewData, setViewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(searchQuery);
  const [selectedExam, setSelectedExam] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [profileDraft, setProfileDraft] = useState({ name: "", studentId: "", programme: "" });

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError("");
      setViewData(null);

      try {
        const [profileResult, dashboardResult] = await Promise.allSettled([
          getStudentProfile(),
          getStudentDashboard(),
        ]);
        if (ignore) return;
        if (profileResult.status === "rejected") throw profileResult.reason;
        const sessionProfile = profileResult.value;

        if (sessionProfile.role !== "student") {
          navigate(sessionProfile.role === "lecturer" ? "/lecturer/dashboard" : "/signin", { replace: true });
          return;
        }

        setProfile(sessionProfile);
        if (dashboardResult.status === "fulfilled") {
          setDashboard(dashboardResult.value);
        } else {
          setDashboard(null);
          setError(`Dashboard summary could not be loaded: ${dashboardResult.reason.message || "student service unavailable"}`);
        }
        setProfileDraft({
          name: sessionProfile.name || "",
          studentId: sessionProfile.studentId || "",
          programme: sessionProfile.programme || "",
        });

        let data = null;
        if (view === "exams") {
          data = await getStudentExams({ status: examStatus, search: searchQuery, module: moduleFilter, sort: sortOrder, page: pageNumber, limit: 8 });
        } else if (view === "results") {
          data = await getStudentResults({ page: pageNumber, limit: 8, search: searchQuery, module: moduleFilter, sort: sortOrder });
        } else if (view === "analytics") {
          data = await getStudentAnalytics();
        } else if (view === "notifications") {
          data = await getStudentNotifications({ page: pageNumber, limit: 10, type: notificationType, search: searchQuery });
        }
        if (!ignore) {
          setViewData(data);
          if (view === "notifications" && data?.unreadCount != null) setDashboard((current) => current && ({ ...current, summary: { ...current.summary, unreadNotifications: data.unreadCount } }));
        }
      } catch (loadError) {
        if (ignore) return;
        if (loadError.status === 401) {
          navigate("/signin", { replace: true });
          return;
        }
        if (loadError.status === 403) {
          navigate("/lecturer/dashboard", { replace: true });
          return;
        }
        setError(loadError.message || "Unable to load student information.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    load();
    return () => { ignore = true; };
  }, [view, examStatus, pageNumber, searchQuery, moduleFilter, sortOrder, notificationType, retryCount, navigate]);

  useEffect(() => {
    if (!["dashboard", "exams", "notifications"].includes(view)) return undefined;
    const timer = window.setInterval(() => setRetryCount((value) => value + 1), 30000);
    return () => window.clearInterval(timer);
  }, [view]);

  const unreadCount = dashboard?.summary?.unreadNotifications || 0;
  const titles = {
    dashboard: "Dashboard",
    exams: "My Exams",
    available: "Available Exams",
    upcoming: "Upcoming Exams",
    ongoing: "Ongoing Exams",
    completed: "Completed Exams",
    missed: "Missed Exams",
    results: "Results & Grades",
    analytics: "Performance Analytics",
    notifications: "Notifications",
    profile: "My Profile",
    settings: "Settings",
  };
  const pageTitle = view === "exams" && examStatus !== "all" ? titles[examStatus] : (titles[view] || "Page not found");

  function isActive(item) {
    if (item.view !== view) return false;
    return view !== "exams" || item.status === examStatus;
  }

  async function handleLogout() {
    setError("");
    try {
      await logoutStudent();
      setAuthenticatedUser(null);
      navigate("/signin", { replace: true });
    } catch (logoutError) {
      if (logoutError.status === 401) {
        setAuthenticatedUser(null);
        navigate("/signin", { replace: true });
        return;
      }
      setError(logoutError.message || "Unable to sign out right now.");
    }
  }

  async function showExamDetails(examId) {
    setError("");
    try {
      setSelectedExam({ loading: true });
      const data = await getStudentExam(examId);
      setSelectedExam(data.exam);
    } catch (detailError) {
      setSelectedExam(null);
      setError(detailError.message || "Unable to load exam details.");
    }
  }

  function submitExamSearch(event) {
    event.preventDefault();
    const params = new URLSearchParams(location.search);
    params.delete("page");
    if (searchDraft.trim()) params.set("search", searchDraft.trim());
    else params.delete("search");
    const search = params.toString();
    const basePath = view === "notifications" ? "/student/notifications" : view === "results" ? "/student/results" : examFilterPaths[examStatus];
    navigate(`${basePath}${search ? `?${search}` : ""}`);
  }

  function updateExamFilters(changes) {
    const nextStatus = changes.status || examStatus;
    const params = new URLSearchParams(location.search);
    params.delete("status");
    params.delete("page");
    Object.entries(changes).forEach(([key, value]) => {
      if (key !== "status") {
        if (value) params.set(key, value);
        else params.delete(key);
      }
    });
    const search = params.toString();
    navigate(`${examFilterPaths[nextStatus]}${search ? `?${search}` : ""}`);
  }

  function updateNotificationFilters(changes) {
    const params = new URLSearchParams(location.search);
    params.delete("page");
    Object.entries(changes).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    const search = params.toString();
    navigate(`/student/notifications${search ? `?${search}` : ""}`);
  }

  function updateResultFilters(changes) {
    const params = new URLSearchParams(location.search);
    params.delete("page");
    Object.entries(changes).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    const search = params.toString();
    navigate(`/student/results${search ? `?${search}` : ""}`);
  }

  async function saveProfile(event) {
    event.preventDefault();
    setProfileSaving(true);
    setProfileMessage("");
    setError("");
    try {
      const updated = await updateStudentProfile({ name: profileDraft.name, programme: profileDraft.programme });
      setProfile(updated);
      setProfileDraft({
        name: updated.name || "",
        studentId: updated.studentId || "",
        programme: updated.programme || "",
      });
      setProfileMessage("Profile saved.");
    } catch (saveError) {
      if (saveError.status === 401) {
        navigate("/signin", { replace: true });
        return;
      }
      setError(saveError.message || "Unable to save profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  function cancelProfileEdit() {
    setProfileDraft({ name: profile?.name || "", studentId: profile?.studentId || "", programme: profile?.programme || "" });
    setProfileMessage("");
  }

  async function savePassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const currentPassword = String(formData.get("currentPassword") || "");
    const newPassword = String(formData.get("newPassword") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    setPasswordMessage("");
    if (newPassword !== confirmPassword) {
      setPasswordMessage("New password and confirmation do not match.");
      return;
    }
    setPasswordSaving(true);
    try {
      const result = await changeStudentPassword(currentPassword, newPassword);
      form.reset();
      setPasswordMessage(result.message || "Password updated successfully.");
    } catch (passwordError) {
      if (passwordError.status === 401) {
        navigate("/signin", { replace: true });
        return;
      }
      setPasswordMessage(passwordError.message || "Unable to update your password.");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function markRead(notificationId) {
    try {
      await markStudentNotificationRead(notificationId);
      setViewData((current) => current && ({
        ...current,
        unreadCount: Math.max(0, (current.unreadCount || 0) - 1),
        items: current.items.map((item) => item._id === notificationId ? { ...item, readAt: new Date().toISOString() } : item),
      }));
      setDashboard((current) => current && ({
        ...current,
        summary: { ...current.summary, unreadNotifications: Math.max(0, current.summary.unreadNotifications - 1) },
      }));
    } catch (readError) {
      if (readError.status === 401) navigate("/signin", { replace: true });
      else setError(readError.message || "Unable to update notification.");
    }
  }

  async function markAllRead() {
    setError("");
    try {
      const result = await markAllStudentNotificationsRead();
      setNotificationMessage(`${result.modifiedCount} notification${result.modifiedCount === 1 ? "" : "s"} marked as read.`);
      setViewData((current) => current && ({
        ...current,
        unreadCount: 0,
        items: current.items.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })),
      }));
      setDashboard((current) => current && ({
        ...current,
        summary: { ...current.summary, unreadNotifications: 0 },
      }));
    } catch (markError) {
      if (markError.status === 401) navigate("/signin", { replace: true });
      else setError(markError.message || "Unable to mark notifications as read.");
    }
  }

  function changePage(nextPage) {
    const params = new URLSearchParams(location.search);
    params.set("page", String(nextPage));
    navigate(`${location.pathname}?${params.toString()}`);
  }

  return (
    <div className="student-workspace">
      {sidebarOpen && <button className="student-sidebar-backdrop" type="button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`student-workspace-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <Link to="/student/dashboard" className="student-workspace-brand" onClick={() => setSidebarOpen(false)}>
          <img src="/examora-logo.jpeg" alt="" />
          <span>Examora<small>STUDENT PORTAL</small></span>
        </Link>
        <div className="student-nav-caption">ACADEMIC</div>
        <nav className="student-workspace-nav" aria-label="Student dashboard">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`student-workspace-link ${isActive(item) ? "is-active" : ""}`}
                aria-current={isActive(item) ? "page" : undefined}
              >
                <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                <span>{item.label}</span>
                {item.view === "notifications" && unreadCount > 0 && <b>{unreadCount > 9 ? "9+" : unreadCount}</b>}
              </Link>
            );
          })}
        </nav>
        <div className="student-sidebar-profile">
          <div className="student-avatar">{profile?.name?.charAt(0)?.toUpperCase() || "S"}</div>
          <div><strong>{profile?.name || "Student"}</strong><span>{profile?.email || ""}</span></div>
          <button type="button" aria-label="Log out" title="Log out" onClick={handleLogout}><LogOut size={16} /></button>
        </div>
      </aside>

      <div className="student-workspace-main">
        <header className="student-topbar">
          <button type="button" className="student-mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="student-breadcrumb"><span>EXAMORA</span><b>/</b>{pageTitle}</div>
          <div className="student-topbar-actions">
            {(view === "exams" || view === "notifications" || view === "results") && (
              <form className="student-search" onSubmit={submitExamSearch} role="search">
                <Search size={16} aria-hidden="true" />
                <input aria-label={view === "exams" ? "Search exams" : view === "results" ? "Search results" : "Search notifications"} placeholder={view === "exams" ? "Search exams or modules" : view === "results" ? "Search results" : "Search notifications"} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} />
              </form>
            )}
            <Link to="/student/notifications" className="student-notification-button" aria-label={`Notifications, ${unreadCount} unread`}>
              <Bell size={18} aria-hidden="true" />
              {unreadCount > 0 && <span>{unreadCount > 9 ? "9+" : unreadCount}</span>}
            </Link>
            <div className="student-profile-menu-wrap">
              <button type="button" className="student-top-profile" aria-haspopup="menu" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((open) => !open)}>
                <span className="student-avatar small">{profile?.name?.charAt(0)?.toUpperCase() || "S"}</span>
                <span>{profile?.name || "Student"}</span>
              </button>
              {profileMenuOpen && <div className="student-profile-menu" role="menu"><Link role="menuitem" to="/student/profile" onClick={() => setProfileMenuOpen(false)}>My Profile</Link><Link role="menuitem" to="/student/settings" onClick={() => setProfileMenuOpen(false)}>Settings</Link><button role="menuitem" type="button" onClick={() => { setProfileMenuOpen(false); handleLogout(); }}>Log out</button></div>}
            </div>
          </div>
        </header>

        <main className="student-page-content">
          {error && <Toast key={`error:${error}`} message={error} type="error" onClose={() => setError("")} action={{ label: "Retry", onClick: () => setRetryCount((value) => value + 1), disabled: loading }} />}
          {loading ? <StudentLoadingState /> : !profile ? (
            <EmptyState title="Student profile unavailable" detail="Please sign in again or contact your university administrator." icon={UserRound} />
          ) : (
            <>
              {view === "dashboard" && <DashboardOverview profile={profile} dashboard={dashboard} onDetails={showExamDetails} />}
              {view === "exams" && <ExamList title={pageTitle} data={viewData} status={examStatus} moduleFilter={moduleFilter} sortOrder={sortOrder} onFilters={updateExamFilters} onDetails={showExamDetails} onResult={() => navigate("/student/results")} onPage={changePage} />}
              {view === "results" && <ResultsView data={viewData} moduleFilter={moduleFilter} sortOrder={sortOrder} onFilters={updateResultFilters} onPage={changePage} />}
              {view === "analytics" && <AnalyticsView data={viewData} dashboard={dashboard} onOpenResults={() => navigate("/student/results")} />}
              {view === "notifications" && <NotificationsView data={viewData} onRead={markRead} onReadAll={markAllRead} onFilters={updateNotificationFilters} onDetails={showExamDetails} type={notificationType} onPage={changePage} />}
              {view === "profile" && <ProfileView profile={profile} draft={profileDraft} onChange={setProfileDraft} onSubmit={saveProfile} onCancel={cancelProfileEdit} saving={profileSaving} message={profileMessage} />}
              {view === "settings" && <SettingsView theme={theme} onToggleTheme={onToggleTheme} onLogout={handleLogout} onChangePassword={savePassword} passwordSaving={passwordSaving} passwordMessage={passwordMessage} />}
              {view === "not-found" && <EmptyState title="Student page not found" detail="Choose a page from the Student Portal navigation." icon={BookOpen} />}
            </>
          )}
        </main>
      </div>

      {selectedExam && <ExamDetails exam={selectedExam} onClose={() => setSelectedExam(null)} onStart={(examId) => { setSelectedExam(null); navigate(`/student/exams/${examId}/attempt`); }} />}
      {notificationMessage && <Toast key={`success:${notificationMessage}`} message={notificationMessage} type="success" onClose={() => setNotificationMessage("")} />}
    </div>
  );
}

function DashboardOverview({ profile, dashboard, onDetails }) {
  const summary = dashboard?.summary;
  return (
    <>
      <section className="student-welcome-band">
        <div>
          <span className="student-section-eyebrow">STUDENT OVERVIEW</span>
          <h1>Welcome back, {profile.name || "Student"}</h1>
          <p>Your academic workspace, with exam schedules and released results in one place.</p>
          <time className="student-dashboard-date">{new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(new Date())}</time>
        </div>
        <div className="student-welcome-mark"><BookOpen size={34} aria-hidden="true" /><span>EXAMORA</span></div>
      </section>

      <section className="student-summary-grid dashboard-summary-grid" aria-label="Exam summary">
        <SummaryCard to="/student/exams" label="Assigned exams" value={summary?.totalAssigned ?? "—"} detail="Published for your account" icon={BookOpen} tone="tone-blue" />
        <SummaryCard to="/student/exams/available" label="Available now" value={summary?.available ?? "—"} detail="Within the scheduled window" icon={CalendarDays} tone="tone-violet" />
        <SummaryCard to="/student/exams/upcoming" label="Upcoming" value={summary?.upcoming ?? "—"} detail="Scheduled for a future date" icon={Clock3} tone="tone-teal" />
        <SummaryCard to="/student/exams/ongoing" label="Ongoing" value={summary?.ongoing ?? "—"} detail="Attempts in progress" icon={Clock3} tone="tone-teal" />
        <SummaryCard to="/student/exams/completed" label="Completed" value={summary?.completed ?? "—"} detail="Successfully submitted attempts" icon={CheckCircle2} tone="tone-amber" />
        <SummaryCard to="/student/exams/missed" label="Missed exams" value={summary?.missed ?? "—"} detail="Closed without a valid submission" icon={AlertCircle} tone="tone-amber" />
        <SummaryCard to="/student/results" label="Published results" value={summary?.publishedResults ?? "—"} detail="Officially released results" icon={FileCheck2} tone="tone-blue" />
      </section>

      <nav className="student-dashboard-quicklinks" aria-label="Quick actions">
        <Link to="/student/exams"><BookOpen size={15} />My Exams</Link>
        <Link to="/student/exams/available"><CalendarDays size={15} />Available Exams</Link>
        <Link to="/student/results"><FileCheck2 size={15} />Results & Grades</Link>
        <Link to="/student/profile"><UserRound size={15} />My Profile</Link>
      </nav>

      <div className="student-lower-grid student-schedule-grid">
        <section className="student-panel">
          <div className="student-content-heading compact"><div><span className="student-section-eyebrow">SCHEDULED AHEAD</span><h2>Upcoming exams</h2></div><Link to="/student/exams/upcoming" className="student-view-all">View all <ArrowRight size={14} /></Link></div>
          {(dashboard?.upcomingExams || []).length ? <div className="student-exam-grid">{dashboard.upcomingExams.slice(0, 2).map((exam) => <ExamCard key={exam.id} exam={exam} onDetails={onDetails} />)}</div> : <p className="student-inline-empty">No future exams are scheduled for your account.</p>}
        </section>
        <section className="student-panel">
          <div className="student-content-heading compact"><div><span className="student-section-eyebrow">OPEN NOW</span><h2>Available exams</h2></div><Link to="/student/exams/available" className="student-view-all">View all <ArrowRight size={14} /></Link></div>
          {(dashboard?.availableExams || []).length ? <div className="student-exam-grid">{dashboard.availableExams.slice(0, 2).map((exam) => <ExamCard key={exam.id} exam={exam} onDetails={onDetails} />)}</div> : <p className="student-inline-empty">There are no exams available to start right now.</p>}
        </section>
      </div>

      <div className="student-lower-grid">
        <section className="student-panel">
          <div className="student-content-heading compact"><div><span className="student-section-eyebrow">IN PROGRESS</span><h2>Ongoing exams</h2></div><Link to="/student/exams/ongoing" className="student-view-all">See all <ArrowRight size={14} /></Link></div>
          {(dashboard?.ongoingExams || []).length ? <div className="student-activity-list">{dashboard.ongoingExams.map((exam) => <ExamRow exam={exam} key={exam.id} onDetails={onDetails} />)}</div> : <p className="student-inline-empty">No exams are currently in progress.</p>}
        </section>
        <section className="student-panel">
          <div className="student-content-heading compact"><div><span className="student-section-eyebrow">PUBLISHED</span><h2>Recent results</h2></div><Link to="/student/results" className="student-view-all">All results <ArrowRight size={14} /></Link></div>
          {(dashboard?.recentResults || []).length ? <div className="student-activity-list">{dashboard.recentResults.map((result) => <div className="student-activity-row" key={result.id}><span className="activity-dot" /><div><strong>{result.title}</strong><span>{result.module || "Module not set"} · {result.marksObtained}/{result.maximumMarks} marks{result.grade ? ` · Grade ${result.grade}` : ""}</span></div><time>{formatDate(result.publishedAt, { month: "short", day: "numeric" })}</time></div>)}</div> : <p className="student-inline-empty">Published results will appear here when they are released.</p>}
        </section>
        <section className="student-panel">
          <div className="student-content-heading compact"><div><span className="student-section-eyebrow">RECENTLY COMPLETED</span><h2>Completed exams</h2></div><Link to="/student/exams/completed" className="student-view-all">See all <ArrowRight size={14} /></Link></div>
          {(dashboard?.completedExams || []).length ? <div className="student-activity-list">{dashboard.completedExams.slice(0, 4).map((exam) => <div className="student-activity-row" key={exam.id}><span className="activity-dot" /><div><strong>{exam.title}</strong><span>{exam.module || "Module not set"} · {exam.attempt?.submittedAt ? `Submitted ${formatDate(exam.attempt.submittedAt, { dateStyle: "medium" })}` : exam.attempt?.status === "expired" ? "Attempt expired" : "Completed"}</span></div>{exam.resultPublished && <Link className="student-icon-action" to="/student/results" aria-label={`View ${exam.title} result`}><ArrowRight size={15} /></Link>}</div>)}</div> : <p className="student-inline-empty">Completed attempts will appear here.</p>}
        </section>
      </div>

      <section className="student-panel student-panel-wide student-performance-preview">
        <div className="student-content-heading compact"><div><span className="student-section-eyebrow">RELEASED RESULTS</span><h2>Performance preview</h2></div><Link to="/student/performance" className="student-view-all">View performance <ArrowRight size={14} /></Link></div>
        <div className="student-performance-average"><strong>{dashboard?.performance?.averagePercentage == null ? "—" : `${dashboard.performance.averagePercentage.toFixed(1)}%`}</strong><span>Average across {dashboard?.performance?.resultCount ?? 0} published result{dashboard?.performance?.resultCount === 1 ? "" : "s"}</span></div>
        {(dashboard?.recentResults || []).length ? <div className="student-bars">{dashboard.recentResults.slice(0, 4).map((result) => <div className="student-bar-row" key={result.id}><div><strong>{result.title}</strong><span>{result.percentage == null ? `${result.marksObtained} / ${result.maximumMarks} marks` : `${result.percentage.toFixed(1)}% · ${result.marksObtained} / ${result.maximumMarks}`}</span></div><div className="student-bar-track" role="img" aria-label={`${result.title}: ${result.percentage == null ? "percentage unavailable" : `${result.percentage.toFixed(1)} percent`}`}><span style={{ width: `${Math.max(0, Math.min(100, result.percentage || 0))}%` }} /></div></div>)}</div> : <p className="student-inline-empty">Performance details will appear after results are officially published.</p>}
      </section>

      <section className="student-panel student-panel-wide">
        <div className="student-content-heading compact"><div><span className="student-section-eyebrow">LATEST</span><h2>Recent activity</h2></div><Link to="/student/notifications" className="student-view-all">Notifications <ArrowRight size={14} /></Link></div>
        {(dashboard?.recentActivity || []).length ? <div className="student-activity-list">{dashboard.recentActivity.map((activity) => <div className="student-activity-row" key={activity.id}><span className="activity-dot" /><div><strong>{activity.title}</strong><span>{activity.detail}</span></div><time>{formatDate(activity.occurredAt, { month: "short", day: "numeric" })}</time></div>)}</div> : <p className="student-inline-empty">Exam submissions, released results, and notifications will appear here.</p>}
      </section>
      <section className="student-panel student-panel-wide">
        <div className="student-content-heading compact"><div><span className="student-section-eyebrow">UNIVERSITY UPDATES</span><h2>Important announcements</h2></div><Link to="/student/notifications" className="student-view-all">All notices <ArrowRight size={14} /></Link></div>
        {(dashboard?.announcements || []).length ? <div className="student-activity-list">{dashboard.announcements.map((announcement) => <div className="student-activity-row" key={announcement.id}><span className="activity-dot" /><div><strong>{announcement.title}</strong><span>{announcement.message}</span></div><time>{formatDate(announcement.createdAt, { month: "short", day: "numeric" })}</time></div>)}</div> : <p className="student-inline-empty">There are no recent announcements for your account.</p>}
      </section>
    </>
  );
}

function ExamRow({ exam, onDetails }) {
  return <div className="student-activity-row"><span className="activity-dot active" /><div><strong>{exam.title}</strong><span>{exam.module} · deadline {formatDate(exam.attempt?.deadlineAt)}</span></div><button type="button" className="student-icon-action" title="View details" aria-label={`View ${exam.title} details`} onClick={() => onDetails(exam.id)}><ChevronRight size={17} /></button></div>;
}

function ExamList({ title, data, status, moduleFilter, sortOrder, onFilters, onDetails, onResult, onPage }) {
  const items = data?.items || [];
  const upcomingGroups = status === "upcoming"
    ? items.reduce((groups, exam) => {
        const date = new Date(exam.startsAt).toLocaleDateString();
        groups[date] = [...(groups[date] || []), exam];
        return groups;
      }, {})
    : null;
  return (
    <>
      <section className="student-page-heading"><div><span className="student-section-eyebrow">EXAM SCHEDULE</span><h1>{title}</h1><p>Only published exams assigned to your student account are listed.</p></div></section>
      <div className="student-exam-controls">
        <div className="student-filter-tabs" role="tablist" aria-label="Filter exams">
          {examFilters.map((filter) => <button type="button" role="tab" aria-selected={status === filter} className={status === filter ? "is-selected" : ""} key={filter} onClick={() => onFilters({ status: filter })}>{filter === "all" ? "All exams" : filter[0].toUpperCase() + filter.slice(1)}</button>)}
        </div>
        <div className="student-select-filters">
          <label><SlidersHorizontal size={14} aria-hidden="true" /> Module<select aria-label="Filter by module" value={moduleFilter} onChange={(event) => onFilters({ module: event.target.value })}><option value="">All modules</option>{(data?.modules || []).map((module) => <option value={module} key={module}>{module}</option>)}</select></label>
          <label>Sort<select aria-label="Sort exams" value={sortOrder} onChange={(event) => onFilters({ sort: event.target.value })}><option value="date_asc">Date: earliest</option><option value="date_desc">Date: latest</option></select></label>
        </div>
      </div>
      {items.length ? status === "upcoming" ? <section className="student-date-groups">{Object.entries(upcomingGroups).map(([date, exams]) => <div className="student-date-group" key={date}><h2>{date}</h2><div className="student-exam-grid">{exams.map((exam) => <ExamCard key={exam.id} exam={exam} onDetails={onDetails} onResult={onResult} />)}</div></div>)}</section> : <section className="student-exam-grid">{items.map((exam) => <ExamCard key={exam.id} exam={exam} onDetails={onDetails} onResult={onResult} />)}</section> : <EmptyState title={status === "upcoming" ? "No upcoming exams scheduled." : status === "ongoing" || status === "available" ? "You have no ongoing exams." : status === "completed" ? "No completed exams yet." : status === "missed" ? "No missed exams." : "No exams assigned"} detail={status === "missed" ? "Exams closed without a valid submission will appear here." : "Published exams assigned to your account will appear here."} icon={CalendarDays} />}
      <Pagination data={data} onPage={onPage} />
    </>
  );
}

function ResultsView({ data, moduleFilter, sortOrder, onFilters, onPage }) {
  const items = data?.items || [];
  return (
    <>
      <section className="student-page-heading"><div><span className="student-section-eyebrow">ACADEMIC RECORD</span><h1>Results & Grades</h1><p>Only results published for your account are shown.</p></div><div className="student-result-total"><strong>{data?.total ?? "—"}</strong><span>released results</span></div>{items.length > 0 && <button type="button" className="student-secondary-button" onClick={() => window.print()}><Printer size={15} aria-hidden="true" /> Print</button>}</section>
      <div className="student-select-filters results-filters">
        <label><SlidersHorizontal size={14} aria-hidden="true" /> Module<select aria-label="Filter results by module" value={moduleFilter} onChange={(event) => onFilters({ module: event.target.value })}><option value="">All modules</option>{(data?.modules || []).map((module) => <option value={module} key={module}>{module}</option>)}</select></label>
        <label>Sort<select aria-label="Sort results" value={sortOrder} onChange={(event) => onFilters({ sort: event.target.value })}><option value="published_desc">Published: newest</option><option value="published_asc">Published: oldest</option><option value="marks_desc">Marks: highest</option><option value="marks_asc">Marks: lowest</option></select></label>
      </div>
      {items.length ? <div className="student-table-wrap"><table className="student-table"><thead><tr><th>Examination</th><th>Module</th><th>Submitted</th><th>Published</th><th>Marks</th><th>Percentage</th><th>Grade</th><th>Details</th></tr></thead><tbody>{items.map((result) => <tr key={result.id}><td>{result.exam?.title || "Examination"}</td><td>{result.exam?.module || "—"}</td><td>{result.submissionDate ? formatDate(result.submissionDate, { dateStyle: "medium" }) : "—"}</td><td>{formatDate(result.publishedAt, { dateStyle: "medium" })}</td><td>{result.marksObtained} / {result.maximumMarks}</td><td>{result.percentage === null ? "—" : `${result.percentage.toFixed(1)}%`}</td><td>{result.grade || "Not assigned"}</td><td><details><summary>View</summary><span>{result.marksObtained} of {result.maximumMarks} marks · {result.grade || "No grade assigned"}</span></details></td></tr>)}</tbody></table></div> : !data ? null : <EmptyState title="No results released" detail="Results will appear here after your lecturer publishes them." icon={FileCheck2} />}
      <Pagination data={data} onPage={onPage} />
    </>
  );
}

function AnalyticsView({ data, dashboard, onOpenResults }) {
  const [moduleFilter, setModuleFilter] = useState("");
  if (!data) return null;
  const modules = (data.byModule || []).filter((item) => !moduleFilter || item.module === moduleFilter);
  const results = (data.results || []).filter((item) => !moduleFilter || item.module === moduleFilter);
  const completed = dashboard?.summary?.completed ?? 0;
  const upcoming = dashboard?.summary?.upcoming ?? 0;
  const pendingResults = Math.max(0, completed - (data.results?.length || 0));
  const distribution = [
    { label: "0–25%", min: 0, max: 25 },
    { label: "25–50%", min: 25, max: 50 },
    { label: "50–75%", min: 50, max: 75 },
    { label: "75–100%", min: 75, max: 101 },
  ].map((band) => ({ ...band, count: results.filter((item) => item.percentage >= band.min && item.percentage < band.max).length }));
  return (
    <>
      <section className="student-page-heading"><div><span className="student-section-eyebrow">YOUR PROGRESS</span><h1>Performance Analytics</h1><p>Only published results for your account are included. Average is the mean of each result's percentage.</p></div><button type="button" className="student-secondary-button" onClick={onOpenResults}>Assessment history <ArrowRight size={14}/></button></section>
      <section className="student-summary-grid analytics-summary" aria-label="Academic summary">
        <SummaryCard label="Total exams" value={dashboard?.summary?.totalAssigned ?? "—"} detail="Published and assigned" icon={BookOpen} tone="tone-blue" />
        <SummaryCard label="Completed" value={completed} detail="Submitted exams" icon={CheckCircle2} tone="tone-teal" />
        <SummaryCard label="Upcoming" value={upcoming} detail="Scheduled for later" icon={Clock3} tone="tone-violet" />
        <SummaryCard label="Published results" value={data.results?.length ?? 0} detail="Official marks released" icon={FileCheck2} tone="tone-blue" />
        <SummaryCard label="Average result" value={data.averagePercentage === null ? "—" : `${data.averagePercentage.toFixed(1)}%`} detail="Mean percentage across released results" icon={ChartColumn} tone="tone-violet" />
        <SummaryCard label="Highest result" value={data.highestPercentage === null ? "—" : `${data.highestPercentage.toFixed(1)}%`} detail="Best published percentage" icon={CheckCircle2} tone="tone-teal" />
        <SummaryCard label="Pending results" value={pendingResults} detail="Submitted exams without a released result" icon={FileCheck2} tone="tone-amber" />
      </section>
      <div className="student-select-filters results-filters"><label><SlidersHorizontal size={14} aria-hidden="true"/>Module<select aria-label="Filter performance by module" value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}><option value="">All modules</option>{(data.byModule || []).map((item) => <option key={item.module} value={item.module}>{item.module}</option>)}</select></label></div>
      {results.length ? <>
        <section className="student-panel student-chart-panel"><div className="student-content-heading compact"><div><span className="student-section-eyebrow">ASSESSMENT PROGRESS</span><h2>Published exam scores</h2></div><span className="student-chart-note">Percentage by assessment · chronological</span></div><ProgressLineChart points={results.map((item) => ({ id: item.id, label: item.exam, percentage: item.percentage, marksObtained: item.marksObtained, maximumMarks: item.maximumMarks, date: item.publishedAt ? formatDate(item.publishedAt, { dateStyle: "medium" }) : "" }))} label="Student published assessment progress" color="#756bd9"/></section>
        {modules.length > 0 && <section className="student-panel student-chart-panel"><div className="student-content-heading compact"><div><span className="student-section-eyebrow">BY SUBJECT</span><h2>Subject-wise performance</h2></div><span className="student-chart-note">Average published percentage</span></div><div className="student-bars">{modules.map((item) => <div className="student-bar-row" key={item.module}><div><strong>{item.module}</strong><span>{item.averagePercentage.toFixed(1)}% · {item.resultCount} result{item.resultCount === 1 ? "" : "s"}</span></div><div className="student-bar-track" role="img" aria-label={`${item.module}: ${item.averagePercentage.toFixed(1)} percent`}><span style={{ width: `${Math.min(100, Math.max(0, item.averagePercentage))}%` }} /></div></div>)}</div></section>}
        <section className="student-panel student-chart-panel"><div className="student-content-heading compact"><div><span className="student-section-eyebrow">SCORE DISTRIBUTION</span><h2>Published result percentage bands</h2></div></div><p className="student-chart-note">These are display ranges only, not university grade boundaries.</p><div className="student-bars">{distribution.map((band) => <div className="student-bar-row" key={band.label}><div><strong>{band.label}</strong><span>{band.count} result{band.count === 1 ? "" : "s"}</span></div><div className="student-bar-track" role="img" aria-label={`${band.label}: ${band.count} results`}><span style={{ width: `${results.length ? Math.max(band.count ? 5 : 0, band.count / results.length * 100) : 0}%` }} /></div></div>)}</div></section>
        <section className="student-panel student-chart-panel"><div className="student-content-heading compact"><div><span className="student-section-eyebrow">ASSESSMENT HISTORY</span><h2>Published results</h2></div><button type="button" className="student-text-button" onClick={onOpenResults}>Open results <ArrowRight size={14}/></button></div><div className="student-table-wrap"><table className="student-table"><thead><tr><th>Assessment</th><th>Module</th><th>Submitted</th><th>Marks</th><th>Percentage</th><th>Status</th></tr></thead><tbody>{results.map((item) => <tr key={item.id}><td>{item.exam}</td><td>{item.module}</td><td>{item.submissionDate ? formatDate(item.submissionDate, { dateStyle: "medium" }) : "—"}</td><td>{item.marksObtained} / {item.maximumMarks}</td><td>{item.percentage === null ? "—" : `${item.percentage.toFixed(1)}%`}</td><td><ExamStatus status="completed"/> · Released</td></tr>)}</tbody></table></div></section>
      </> : <EmptyState title="Analytics will appear after results are published" detail="There are no released marks for this module yet. Unpublished results are not included in your statistics." icon={ChartColumn} />}
    </>
  );
}

function NotificationsView({ data, onRead, onReadAll, onFilters, onDetails, type, onPage }) {
  const items = data?.items || [];
  return (
    <>
      <section className="student-page-heading"><div><span className="student-section-eyebrow">CAMPUS UPDATES</span><h1>Notifications</h1><p>{data?.unreadCount ?? 0} unread notification{data?.unreadCount === 1 ? "" : "s"}</p></div>{data?.unreadCount > 0 && <button type="button" className="student-secondary-button" onClick={onReadAll}>Mark all as read</button>}</section>
      <div className="student-notification-filter"><label>Type<select aria-label="Filter notifications by type" value={type} onChange={(event) => onFilters({ type: event.target.value })}><option value="">All notifications</option><option value="exam_published">New exams</option><option value="exam_started">Exam started</option><option value="announcement">Announcements</option><option value="schedule_change">Schedule changes</option><option value="result_published">Published results</option><option value="academic">Academic</option></select></label></div>
      {items.length ? <section className="student-notification-list">{items.map((item) => <article className={`student-notification ${item.readAt ? "is-read" : "is-unread"}`} key={item._id}><span className="notification-indicator" /><div><div className="notification-title-row"><h2>{item.title}</h2><time>{formatDate(item.createdAt)}</time></div><p>{item.message}</p>{item.exam && <small className="student-notification-exam-meta">{item.exam.module} · scheduled {formatDate(item.exam.startsAt)}</small>}<span className="notification-kind">{item.type.replaceAll("_", " ")}</span>{item.exam && <button type="button" className="student-text-button notification-exam-link" onClick={() => onDetails(String(item.exam._id))}>Open {item.exam.title} <ArrowRight size={13}/></button>}</div>{!item.readAt && <button type="button" className="student-text-button" onClick={() => onRead(item._id)}>Mark read</button>}</article>)}</section> : data && <EmptyState title="You're all caught up" detail="Exam notices, schedule changes, and released-result alerts will appear here." icon={Bell} />}
      <Pagination data={data} onPage={onPage} />
    </>
  );
}

function ProfileView({ profile, draft, onChange, onSubmit, onCancel, saving, message }) {
  function setField(field, value) {
    onChange((current) => ({ ...current, [field]: value }));
  }
  return (
    <>
      <section className="student-page-heading"><div><span className="student-section-eyebrow">ACCOUNT</span><h1>My Profile</h1><p>Update only the profile details allowed by your university.</p></div></section>
      <form className="student-profile-form" onSubmit={onSubmit}>
        <div className="student-profile-heading"><div className="student-avatar large">{profile.name?.charAt(0)?.toUpperCase() || "S"}</div><div><h2>{profile.name}</h2><p>{profile.role} account</p></div></div>
        <div className="student-form-grid">
          <label>Full name<input required maxLength={120} value={draft.name} onChange={(event) => setField("name", event.target.value)} /></label>
          <label>Email<input value={profile.email || ""} readOnly aria-readonly="true" /></label>
          <label>Student ID<input value={profile.studentId || "Not assigned"} readOnly aria-readonly="true" /></label>
          <label>Programme<input maxLength={120} value={draft.programme} onChange={(event) => setField("programme", event.target.value)} placeholder="Not set" /></label>
          <label>Account role<input value={profile.role} readOnly aria-readonly="true" /></label>
        </div>
        <div className="student-profile-actions"><p role="status">{message}</p><button type="button" className="student-secondary-button" onClick={onCancel} disabled={saving}>Cancel</button><button type="submit" className="student-primary-button" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button></div>
      </form>
    </>
  );
}

function SettingsView({ theme, onToggleTheme, onLogout, onChangePassword, passwordSaving, passwordMessage }) {
  return <>
    <section className="student-page-heading"><div><span className="student-section-eyebrow">PREFERENCES</span><h1>Settings</h1><p>Appearance, security, and session controls.</p></div></section>
    <section className="student-settings-list">
      <div><div><strong>Appearance</strong><span>Theme is saved as your Examora preference on this device.</span></div><button type="button" className="student-secondary-button" onClick={onToggleTheme}>{theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}{theme === "dark" ? "Switch to light" : "Switch to dark"}</button></div>
      <div><div><strong>Session</strong><span>Sign out and clear the server session cookie.</span></div><button type="button" className="student-secondary-button danger" onClick={onLogout}><LogOut size={15} />Sign out</button></div>
      <div><div><strong>Notification settings</strong><span>Delivery preferences are controlled by your university.</span></div><span className="student-readonly-setting">Managed by institution</span></div>
      <form className="student-password-form" onSubmit={onChangePassword}>
        <div><strong>Password and security</strong><span>Confirm your existing password to set a new one.</span></div>
        <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" minLength={1} required /></label>
        <label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={10} maxLength={72} required /></label>
        <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={72} required /></label>
        {passwordMessage && <p className="student-password-message" role="status">{passwordMessage}</p>}
        <button type="submit" className="student-primary-button" disabled={passwordSaving}>{passwordSaving ? "Updating…" : "Update password"}</button>
      </form>
    </section>
  </>;
}

function ExamDetails({ exam, onClose, onStart }) {
  const canContinue = exam.attempt?.status === "in_progress" && exam.status === "ongoing";
  const canStart = exam.canStart && exam.status === "ongoing";
  return (
    <div className="student-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="student-exam-dialog" role="dialog" aria-modal="true" aria-labelledby="student-exam-title">
        <div className="student-dialog-head"><span className="student-section-eyebrow">EXAM DETAILS</span><button type="button" className="student-icon-action" onClick={onClose} aria-label="Close exam details"><X size={19} /></button></div>
        {exam.loading ? <div className="student-loading"><span className="student-spinner" />Loading exam…</div> : <>
          <ExamStatus status={exam.status} />
          <h2 id="student-exam-title">{exam.title}</h2>
          <p className="student-exam-module">{exam.module}</p>
          {exam.description && <p className="student-dialog-description">{exam.description}</p>}
          <dl className="student-detail-list"><div><dt>Lecturer</dt><dd>{exam.lecturer || "Not provided"}</dd></div><div><dt>Starts</dt><dd>{formatDate(exam.startsAt)}</dd></div><div><dt>Closes</dt><dd>{formatDate(exam.endsAt)}</dd></div><div><dt>Duration</dt><dd>{exam.durationMinutes} minutes</dd></div><div><dt>Total marks</dt><dd>{exam.totalMarks}</dd></div><div><dt>Questions</dt><dd>{exam.questionCount || 0}</dd></div><div><dt>Attempt status</dt><dd>{exam.attempt?.status || "Not started"}</dd></div></dl>
          {exam.instructions && <div className="student-instructions"><strong>Instructions</strong><p>{exam.instructions}</p></div>}
          {exam.attempt?.status === "submitted" && <div className="student-published-result"><strong>{exam.resultPublished ? "Published result" : "Submitted — Awaiting Evaluation"}</strong>{exam.resultPublished && exam.result ? <p>{exam.result.marksObtained} / {exam.result.maximumMarks} marks{exam.result.grade ? ` · Grade ${exam.result.grade}` : ""}</p> : <p>Your submission is recorded. Marks will appear after authorized release.</p>}{exam.resultPublished && <time>{formatDate(exam.result.publishedAt)}</time>}</div>}
          {exam.status === "missed" && <div className="student-exam-unavailable"><strong>MISSED EXAM</strong><p>{exam.attempt?.closeReason ? "Your active attempt reached its server deadline without a valid submission." : "The scheduled examination window closed without an attempt."}</p></div>}
          {(canStart || canContinue) && <div className="student-exam-actions"><p className="student-dialog-description">Questions open on the dedicated examination page. Your timer uses the server recorded attempt deadline.</p><button type="button" className="student-primary-button" onClick={() => onStart(exam.id)}>{canContinue ? "Continue Exam" : "Start Exam"}</button></div>}
        </>}
      </section>
    </div>
  );
}function Pagination({ data, onPage }) {
  if (!data || data.pages <= 1) return null;
  return <nav className="student-pagination" aria-label="Pagination"><span>Page {data.page} of {data.pages} · {data.total} records</span><div><button type="button" onClick={() => onPage(data.page - 1)} disabled={data.page <= 1} aria-label="Previous page"><ChevronLeft size={16} /></button><button type="button" onClick={() => onPage(data.page + 1)} disabled={data.page >= data.pages} aria-label="Next page"><ChevronRight size={16} /></button></div></nav>;
}

export default StudentDashboardPage;
