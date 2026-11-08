import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Info } from "lucide-react";
import { useAuth } from "../auth/useAuth";

const initialState = {
  email: "",
  password: "",
};

const dashboardRoutes = {
  student: "/student/dashboard",
  lecturer: "/lecturer/dashboard",
  admin: "/admin/dashboard",
};

async function loginUser(email, password) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || "";

  try {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(
        data.message ||
          data.error ||
          "Invalid email or password. Please try again."
      );
      error.code = data.code;
      throw error;
    }

    return data;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Unable to reach the authentication server. Please check the backend connection.",
        { cause: error }
      );
    }

    throw error;
  }
}

function SignIn() {
  const [formData, setFormData] = useState(initialState);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const submissionInFlight = useRef(false);
  const navigate = useNavigate();
  const { setAuthenticatedUser } = useAuth();

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));

    setErrors((current) => ({
      ...current,
      [name]: "",
    }));
  };

  const validate = () => {
    const nextErrors = {};
    const trimmedEmail = formData.email.trim();

    if (!trimmedEmail) {
      nextErrors.email = "University email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextErrors.email = "Please enter a valid email address.";
    }

    if (!formData.password) {
      nextErrors.password = "Password is required.";
    }

    return nextErrors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submissionInFlight.current) return;
    const nextErrors = validate();

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setStatus({
        type: "error",
        message: "Please correct the highlighted fields and try again.",
      });
      return;
    }

    submissionInFlight.current = true;
    setIsSubmitting(true);
    setStatus({ type: "", message: "" });

    try {
      const response = await loginUser(formData.email.trim(), formData.password);
      const role = response?.user?.role || response?.role;
      const redirectPath = response?.redirectPath;

      if (!dashboardRoutes[role] || redirectPath !== dashboardRoutes[role]) {
        throw new Error("The authentication server returned an invalid portal destination.");
      }

      if (!response?.success || !response?.user?.id || response.user.role !== role) {
        throw new Error("The authentication server returned an invalid session.");
      }
      setAuthenticatedUser(response.user);

      setStatus({
        type: "success",
        message: "Sign in successful. Redirecting you to your dashboard...",
      });

      navigate(redirectPath, { replace: true });
    } catch (error) {
      setStatus({
        type: error.code === "ACCOUNT_DEACTIVATED" ? "deactivated" : "error",
        code: error.code || "",
        message: error.message || "Login failed. Please check your credentials.",
      });
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <main className="signin-page">
      <div className="signin-shell">
        <div className="signin-card">
          <div className="signin-brand" aria-label="Examora home">
            <img src={`${import.meta.env.BASE_URL}examora-logo.jpeg`} alt="Examora logo" className="brand-logo" />
            <span>Examora</span>
          </div>

          <div className="signin-header">
            <p className="signin-kicker">UNIVERSITY ACCESS</p>
            <h1>Welcome Back</h1>
            <p className="signin-subtitle">
              Sign in to continue to your examination dashboard.
            </p>
          </div>

          {status.code === "ACCOUNT_DEACTIVATED" ? <section className="signin-deactivated" role="alert"><span><Info size={20}/></span><div><h2>Account Deactivated</h2><p>Your account has been deactivated by the administrator. You cannot access your account at the moment. Please contact the Examora administrator for assistance.</p><button type="button" onClick={() => { setStatus({ type: "", message: "" }); setFormData(initialState); }}>Back to Sign In</button></div></section> : <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="field-group">
              <label htmlFor="email">University email</label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="name@university.edu"
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email && <span className="field-error">{errors.email}</span>}
            </div>

            <div className="field-group">
              <div className="label-row">
                <label htmlFor="password">Password</label>
                <Link to="/forgot-password" className="inline-link">
                  Forgot Password?
                </Link>
              </div>

              <div className="password-wrap">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.password)}
                />
                <button
                  type="button"
                  className="toggle-password"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>

              {errors.password && (
                <span className="field-error">{errors.password}</span>
              )}
            </div>

            {status.message && (
              <div className={`form-status ${status.type}`} role="alert">
                {status.message}
              </div>
            )}

            <button
              type="submit"
              className="auth-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing In..." : "Sign In"}
              <span aria-hidden="true">→</span>
            </button>
          </form>}

          {status.code !== "ACCOUNT_DEACTIVATED" && <p className="signup-prompt">
            Don&apos;t have an account? <Link to="/signup">Sign Up</Link>
          </p>}

          <Link to="/" className="back-home-link">
            ← Back to Home
          </Link>
        </div>

        <div className="signin-visual">
          <div className="visual-badge">SMART ASSESSMENT</div>
          <h2>Digital examination workflow built for university success.</h2>
          <p>
            Manage assessments, monitor academic performance, and run secure
            online exams from one unified platform.
          </p>

          <div className="mini-panel">
            <div>
              <span>Exam sessions</span>
              <strong>128</strong>
            </div>
            <div>
              <span>Avg. completion</span>
              <strong>89%</strong>
            </div>
          </div>

          <div className="visual-card">
            <div className="visual-card-top">
              <span className="dot green" />
              <span className="dot purple" />
              <span className="dot blue" />
            </div>

            <div className="chart-bars" aria-label="Performance chart">
              <span style={{ height: "40%" }} />
              <span style={{ height: "58%" }} />
              <span style={{ height: "76%" }} />
              <span style={{ height: "89%" }} />
              <span style={{ height: "100%" }} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export function SignUpPlaceholder() {
  return (
    <main className="auth-placeholder-page">
      <div className="auth-placeholder-card">
        <p className="signin-kicker">SIGN UP</p>
        <h1>Registration is coming soon</h1>
        <p>
          The university registration flow is not implemented yet. Please contact
          the academic coordinator to create an account.
        </p>
        <Link to="/signin" className="auth-submit inline-link-button">
          Back to Sign In
        </Link>
      </div>
    </main>
  );
}

export function ForgotPasswordPlaceholder() {
  return (
    <main className="auth-placeholder-page">
      <div className="auth-placeholder-card">
        <p className="signin-kicker">PASSWORD RESET</p>
        <h1>Forgot password</h1>
        <p>
          Password recovery is not yet connected to the backend. Please use the
          university support portal to reset your password.
        </p>
        <Link to="/signin" className="auth-submit inline-link-button">
          Return to Sign In
        </Link>
      </div>
    </main>
  );
}

export default SignIn;
