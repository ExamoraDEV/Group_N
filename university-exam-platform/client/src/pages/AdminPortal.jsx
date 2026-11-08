import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Activity, AlertCircle, ArrowRight, Check, CheckCircle2, Clock3, GraduationCap, LayoutDashboard, LogOut, Menu, Moon, Plus, RefreshCw, Search, Shield, Sun, UserRound, Users, UserRoundPlus, UserX, X } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { apiFetch } from "../services/apiClient";
import "./AdminPortal.css";

const NAV = [
  ["Dashboard", "/admin/dashboard", LayoutDashboard],
  ["Create Lecturer Account", "/admin/create/lecturer", UserRoundPlus],
  ["Create Student Account", "/admin/create/student", UserRoundPlus],
  ["Lecturer Accounts", "/admin/lecturers", GraduationCap],
  ["Student Accounts", "/admin/students", Users],
  ["Account Activity", "/admin/activity", Activity],
  ["Deactivated Accounts", "/admin/deactivated", UserX],
];
const EMPTY_STATS = { totalLecturerAccounts: 0, totalStudentAccounts: 0, activeLecturerAccounts: 0, activeStudentAccounts: 0, deactivatedLecturerAccounts: 0, deactivatedStudentAccounts: 0, inactiveLecturerAccounts: 0, inactiveStudentAccounts: 0 };
const colomboDate = (value, includeTime = false) => value ? new Intl.DateTimeFormat("en-LK", { timeZone: "Asia/Colombo", dateStyle: "medium", ...(includeTime ? { timeStyle: "short" } : {}) }).format(new Date(value)) : "—";
const colomboTime = (value) => value ? new Intl.DateTimeFormat("en-LK", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(value)) : "—";
const accountId = (row) => row.role === "lecturer" ? row.lecturerId : row.studentId;
const accountLabel = (role) => role === "lecturer" ? "Lecturer" : "Student";

async function request(path, init = {}) {
  const response = await apiFetch(`/api/admin${path}`, { ...init, headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "The account request could not be completed.");
  return data;
}

function StatusBadge({ row }) {
  const status = row.activityStatus || "deactivated";
  const text = status === "never_logged_in" ? "Never logged in" : status[0].toUpperCase() + status.slice(1);
  return <span className={`admin-status ${status}`}><i/>{text}</span>;
}

function MetricCard({ title, value, icon: Icon, tone, note }) {
  return <article className={`admin-metric ${tone}`}><span className="admin-metric-icon"><Icon size={18}/></span><span className="admin-metric-label">{title}</span><strong>{value ?? 0}</strong><small>{note}</small></article>;
}

export default function AdminPortal({ theme, onToggleTheme }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, setAuthenticatedUser } = useAuth();
  const path = location.pathname.replace(/\/$/, "") || "/admin/dashboard";
  const [menuOpen, setMenuOpen] = useState(false);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name_asc");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deactivatedRole, setDeactivatedRole] = useState("lecturer");
  const [pendingAction, setPendingAction] = useState(null);
  const [saving, setSaving] = useState(false);
  const isDeactivatedPage = path === "/admin/deactivated";
  const isActivityPage = path === "/admin/activity";
  const listRole = path === "/admin/lecturers" ? "lecturer" : path === "/admin/students" ? "student" : "";
  const createRole = path === "/admin/create/lecturer" ? "lecturer" : path === "/admin/create/student" ? "student" : "";
  const pageTitle = NAV.find(([, href]) => href === path)?.[0] || "Admin Dashboard";

  const load = useCallback(async (silent = false) => {
    if (!silent) setBusy(true);
    setError("");
    try {
      let payload;
      if (path === "/admin/dashboard") payload = await request("/dashboard");
      else if (isDeactivatedPage) payload = await request(`/deactivated/${deactivatedRole === "lecturer" ? "lecturers" : "students"}?${new URLSearchParams({ search })}`);
      else if (isActivityPage) payload = await request(`/activity?${new URLSearchParams({ search, sort: sort === "name_asc" || sort === "name_desc" ? sort : sort === "oldest" ? "oldest" : "recent" })}`);
      else if (listRole) payload = await request(`/accounts/${listRole === "lecturer" ? "lecturers" : "students"}?${new URLSearchParams({ search, sort, status: statusFilter })}`);
      else payload = null;
      setData(payload);
      return true;
    } catch (err) {
      setData(null);
      setError(err.message || "Unable to load the Admin Portal.");
      return false;
    } finally { if (!silent) setBusy(false); }
  }, [path, isDeactivatedPage, isActivityPage, listRole, deactivatedRole, search, sort, statusFilter]);

  useEffect(() => { const timer = window.setTimeout(() => load(), 140); return () => window.clearTimeout(timer); }, [load]);

  const logout = async () => {
    try { await apiFetch("/api/auth/logout", { method: "POST" }); }
    finally { setAuthenticatedUser(null); navigate("/signin", { replace: true }); }
  };

  const runAccountAction = async () => {
    if (!pendingAction || saving) return;
    setSaving(true); setError(""); setNotice("");
    const { account, mode } = pendingAction;
    const rolePath = account.role === "lecturer" ? "lecturers" : "students";
    try {
      if (mode === "deactivate") await request(`/accounts/${rolePath}/${account._id}/deactivate`, { method: "PATCH" });
      else await request(`/deactivated/${rolePath}/${account._id}/reactivate`, { method: "PATCH" });
      setPendingAction(null);
      setNotice(`${accountLabel(account.role)} account ${mode === "deactivate" ? "deactivated" : "reactivated"}.`);
      await load(true);
    } catch (err) { setError(err.message || `Unable to ${mode} this account.`); }
    finally { setSaving(false); }
  };

  const onAccountCreated = async (created) => {
    setNotice(`${accountLabel(created.role)} account created successfully. The temporary password can now be shared securely with the account holder.`);
  };

  const page = useMemo(() => {
    if (busy) return <div className="admin-loading"><i/><span>Loading account information…</span></div>;
    if (error && !data) return <section className="admin-empty"><AlertCircle/><h2>Unable to load this page</h2><p>{error}</p><button className="admin-button secondary" onClick={() => load()}>Try again</button></section>;
    if (path === "/admin/dashboard") return <Dashboard stats={data?.stats || EMPTY_STATS} onNavigate={navigate}/>;
    if (createRole) return <CreateAccount role={createRole} onCreated={onAccountCreated} setError={setError} setNotice={setNotice}/>;
    if (isDeactivatedPage) return <AccountList rows={data?.items || []} role={deactivatedRole} deactivated search={search} setSearch={setSearch} onAction={setPendingAction} onRefresh={() => load()} busy={busy} activeTab={deactivatedRole} setActiveTab={setDeactivatedRole}/>;
    if (isActivityPage || listRole) return <AccountList rows={data?.items || []} role={listRole} activity={isActivityPage} search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} sort={sort} setSort={setSort} onAction={setPendingAction} onRefresh={() => load()} busy={busy}/>;
    return <section className="admin-empty"><h2>Page not found</h2><Link to="/admin/dashboard">Return to dashboard</Link></section>;
  }, [busy, error, data, path, createRole, isDeactivatedPage, deactivatedRole, isActivityPage, listRole, search, statusFilter, sort, navigate, load]);

  return <div className="admin-shell">
    <aside className={`admin-sidebar ${menuOpen ? "open" : ""}`}>
      <Link to="/admin/dashboard" className="admin-brand" onClick={() => setMenuOpen(false)}><img src={`${import.meta.env.BASE_URL}examora-logo.jpeg`} alt=""/><span>Examora<small>ADMIN PORTAL</small></span></Link>
      <p className="admin-nav-caption">ADMINISTRATION</p>
      <nav aria-label="Admin navigation">{NAV.map(([label, href, Icon]) => <NavLink key={href} to={href} onClick={() => { setMenuOpen(false); setNotice(""); setError(""); setSearch(""); setStatusFilter("all"); }} className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}><Icon size={17}/><span>{label}</span></NavLink>)}</nav>
      <div className="admin-profile"><span className="admin-avatar"><Shield size={18}/></span><span><b>{user?.name || "Administrator"}</b><small>{user?.email}</small></span><button type="button" onClick={logout} title="Log out" aria-label="Log out"><LogOut size={16}/></button></div>
    </aside>
    {menuOpen && <button className="admin-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)}/>}
    <div className="admin-main"><header className="admin-topbar"><button className="admin-menu-button" aria-label="Open navigation" onClick={() => setMenuOpen((open) => !open)}><Menu size={20}/></button><div className="admin-breadcrumb"><span>EXAMORA</span><b>/</b>{pageTitle}</div><div className="admin-top-actions"><span className="admin-secure-label"><Shield size={14}/> ADMINISTRATOR</span><button type="button" onClick={onToggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>{theme === "light" ? <Moon size={17}/> : <Sun size={17}/>}</button></div></header>
      <main className="admin-content"><div className="admin-page-heading"><div><span>EXAMORA · ADMINISTRATION</span><h1>{pageTitle}</h1></div>{(listRole || isActivityPage || isDeactivatedPage) && <button className="admin-button secondary" onClick={() => load()}><RefreshCw size={15}/>Refresh</button>}</div>
        {error && data && <div className="admin-alert error" role="alert"><AlertCircle size={16}/>{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={15}/></button></div>}{notice && <div className="admin-alert success" role="status"><CheckCircle2 size={16}/>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={15}/></button></div>}
        {page}
      </main>
    </div>
    {pendingAction && <div className="admin-modal-backdrop" role="presentation"><section className="admin-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="admin-confirm-title"><button className="admin-modal-close" aria-label="Close dialog" onClick={() => setPendingAction(null)}><X size={18}/></button><span className={`admin-modal-icon ${pendingAction.mode}`}><Shield size={21}/></span><h2 id="admin-confirm-title">{pendingAction.mode === "deactivate" ? "Deactivate account?" : "Reactivate account?"}</h2><p><strong>{pendingAction.account.name}</strong><br/>{accountLabel(pendingAction.account.role)} ID: {accountId(pendingAction.account) || "—"}<br/>{pendingAction.account.email}</p><p>{pendingAction.mode === "deactivate" ? "This account will no longer be able to sign in. Academic records, exam attempts, and results will be preserved." : "This account will be able to sign in again using its existing password. Previous login history will be preserved."}</p><div><button className="admin-button secondary" disabled={saving} onClick={() => setPendingAction(null)}>Cancel</button><button className={`admin-button ${pendingAction.mode === "deactivate" ? "danger" : "primary"}`} disabled={saving} onClick={runAccountAction}>{saving ? "Saving…" : pendingAction.mode === "deactivate" ? "Confirm Deactivation" : "Confirm Reactivation"}</button></div></section></div>}
  </div>;
}

function Dashboard({ stats, onNavigate }) {
  const cards = [
    ["Total Lecturer Accounts", stats.totalLecturerAccounts, GraduationCap, "blue", "All lecturer records"], ["Total Student Accounts", stats.totalStudentAccounts, Users, "violet", "All student records"],
    ["Active Lecturer Accounts", stats.activeLecturerAccounts, Check, "green", "Signed in within 30 days"], ["Active Student Accounts", stats.activeStudentAccounts, Check, "green", "Signed in within 30 days"],
    ["Deactivated Lecturer Accounts", stats.deactivatedLecturerAccounts, UserX, "red", "Sign-in access disabled"], ["Deactivated Student Accounts", stats.deactivatedStudentAccounts, UserX, "red", "Sign-in access disabled"],
    ["Inactive Lecturer Accounts", stats.inactiveLecturerAccounts, Clock3, "amber", "No sign-in within 30 days"], ["Inactive Student Accounts", stats.inactiveStudentAccounts, Clock3, "amber", "No sign-in within 30 days"],
  ];
  return <><section className="admin-welcome"><div><span>ADMINISTRATOR OVERVIEW</span><h2>Account management, made clear.</h2><p>Manage university access while preserving student and lecturer academic records.</p></div><span className="admin-welcome-mark"><Shield size={29}/></span></section><section className="admin-metric-grid">{cards.map(([title, value, icon, tone, note]) => <MetricCard key={title} title={title} value={value} icon={icon} tone={tone} note={note}/>)}</section><section className="admin-quick-panel"><div><span className="admin-panel-eyebrow">ACCOUNT WORKFLOWS</span><h2>Manage university accounts</h2><p>Create accounts, review sign-in activity, or restore access to an account that was deactivated.</p></div><div className="admin-quick-actions"><button className="admin-button primary" onClick={() => onNavigate("/admin/create/lecturer")}><Plus size={16}/>Create Lecturer</button><button className="admin-button secondary" onClick={() => onNavigate("/admin/create/student")}><Plus size={16}/>Create Student</button><button className="admin-button secondary" onClick={() => onNavigate("/admin/deactivated")}><UserX size={16}/>Deactivated Accounts<ArrowRight size={15}/></button></div></section></>;
}

function CreateAccount({ role, onCreated, setError, setNotice }) {
  const [form, setForm] = useState({ id: "", name: "", email: "", password: "", confirmPassword: "" });
  const [saving, setSaving] = useState(false);
  const idName = role === "lecturer" ? "Lecturer ID" : "Student ID";
  const fieldName = role === "lecturer" ? "lecturerId" : "studentId";
  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setError(""); setNotice("");
    if (form.password !== form.confirmPassword) { setError("Passwords do not match."); return; }
    if (new TextEncoder().encode(form.password).length < 10 || new TextEncoder().encode(form.password).length > 72) { setError("Password must be between 10 and 72 UTF-8 bytes."); return; }
    setSaving(true);
    try {
      const data = await request(`/accounts/${role === "lecturer" ? "lecturers" : "students"}`, { method: "POST", body: JSON.stringify({ [fieldName]: form.id, name: form.name, email: form.email, password: form.password, confirmPassword: form.confirmPassword }) });
      setForm({ id: "", name: "", email: "", password: "", confirmPassword: "" }); onCreated(data.account);
    } catch (err) { setError(err.message || "Unable to create the account."); }
    finally { setSaving(false); }
  };
  return <section className="admin-form-card"><div className="admin-form-heading"><span>{role === "lecturer" ? <GraduationCap size={20}/> : <UserRound size={20}/>}</span><div><h2>Create {accountLabel(role)} Account</h2><p>New account access is active immediately. Passwords are securely hashed before storage.</p></div></div><form onSubmit={submit}><label>{idName}<input required maxLength="40" value={form.id} onChange={change("id")} placeholder={role === "lecturer" ? "e.g. LEC004" : "e.g. 22STD004"}/></label><label>Full Name<input required maxLength="120" value={form.name} onChange={change("name")} autoComplete="name" placeholder="Enter the account holder's name"/></label><label>Email Address<input required type="email" value={form.email} onChange={change("email")} autoComplete="email" placeholder={role === "lecturer" ? "LEC004@university.edu" : "22STD004@university.edu"}/></label><div className="admin-form-grid"><label>Password<input required type="password" minLength="10" maxLength="72" value={form.password} onChange={change("password")} autoComplete="new-password"/><small>Use 10–72 UTF-8 bytes.</small></label><label>Confirm Password<input required type="password" minLength="10" maxLength="72" value={form.confirmPassword} onChange={change("confirmPassword")} autoComplete="new-password"/></label></div><button className="admin-button primary" type="submit" disabled={saving}>{saving ? "Creating account…" : <><Plus size={16}/>Create {accountLabel(role)} Account</>}</button></form></section>;
}

function AccountList({ rows, role, deactivated = false, activity = false, search, setSearch, statusFilter, setStatusFilter, sort, setSort, onAction, onRefresh, activeTab, setActiveTab }) {
  const filteredRows = activity ? rows : rows.filter((row) => !role || row.role === role);
  return <section className="admin-list-card"><div className="admin-list-toolbar"><label className="admin-search"><Search size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, ID, or email" aria-label="Search accounts"/></label>{!deactivated && !activity && <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter account activity"><option value="all">All activity statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="never_logged_in">Never logged in</option></select>}{!deactivated && <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort accounts"><option value="name_asc">Name A–Z</option><option value="name_desc">Name Z–A</option><option value="recent">Recent sign-in</option><option value="oldest">Oldest sign-in</option>{!activity && <option value="created">Recently created</option>}</select>}<button className="admin-button secondary admin-refresh" onClick={onRefresh}><RefreshCw size={15}/>Refresh</button></div>
    {deactivated && <div className="admin-tabs" role="tablist" aria-label="Deactivated account type"><button role="tab" aria-selected={activeTab === "lecturer"} className={activeTab === "lecturer" ? "active" : ""} onClick={() => setActiveTab("lecturer")}>Lecturer Accounts</button><button role="tab" aria-selected={activeTab === "student"} className={activeTab === "student" ? "active" : ""} onClick={() => setActiveTab("student")}>Student Accounts</button></div>}
    <div className="admin-table-wrap"><table><thead><tr><th>{role === "lecturer" ? "Lecturer ID" : role === "student" ? "Student ID" : "Account ID"}</th><th>Full Name</th>{activity && <th>Account Type</th>}<th>Email Address</th>{deactivated && <th>Deactivated</th>}<th>Account Status</th><th>Last Sign-in Date</th><th>Last Sign-in Time</th><th>Actions</th></tr></thead><tbody>{filteredRows.map((row) => <tr key={row._id}><td><code>{accountId(row) || "—"}</code></td><td><strong>{row.name}</strong></td>{activity && <td>{accountLabel(row.role)}</td>}<td>{row.email}</td>{deactivated && <td>{colomboDate(row.deactivatedAt)}</td>}<td><StatusBadge row={row}/></td><td>{colomboDate(row.lastLoginAt)}</td><td>{colomboTime(row.lastLoginAt)}</td><td>{deactivated ? <button className="admin-action-button reactivate" onClick={() => onAction({ account: row, mode: "reactivate" })}><CheckCircle2 size={15}/>Reactivate</button> : <button className="admin-action-button deactivate" onClick={() => onAction({ account: row, mode: "deactivate" })}><UserX size={15}/>Deactivate</button>}</td></tr>)}</tbody></table>{!filteredRows.length && <div className="admin-empty"><span><Users size={24}/></span><h2>{deactivated ? "No deactivated accounts" : "No accounts found"}</h2><p>{deactivated ? `There are no deactivated ${role === "lecturer" ? "lecturer" : "student"} accounts matching this search.` : "Try a different search or adjust the activity filter."}</p></div>}</div></section>;
}
