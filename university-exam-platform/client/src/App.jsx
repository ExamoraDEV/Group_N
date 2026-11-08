
import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import "./App.css";
import Home from "./pages/Home";
import SignIn, { ForgotPasswordPlaceholder, SignUpPlaceholder } from "./pages/SignIn";
import StudentDashboard from "./pages/StudentDashboard";
import LecturerDashboard from "./pages/LecturerDashboard";
import StudentExamPage from "./pages/StudentExamPage";
import AdminPortal from "./pages/AdminPortal";
import ProtectedRoute from "./auth/ProtectedRoute";

const THEME_KEY = "examora-theme";

function App() {
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem(THEME_KEY);

    if (savedTheme === "light" || savedTheme === "dark") {
      return savedTheme;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((currentTheme) =>
      currentTheme === "light" ? "dark" : "light"
    );
  };

  return (
    <Routes>
      <Route
        path="/"
        element={
          <div className="app">
            <div className="top-strip">
              <div className="container top-strip-inner">
                <span>EXAMORA · ONLINE EXAM PLATFORM</span>
                <span>Take Exams · Track Progress · Build Your Future</span>
              </div>
            </div>

            <header className="navbar">
              <div className="container navbar-inner">
                <Link to="/" className="brand" aria-label="Examora home">
                    <img
                      src={`${import.meta.env.BASE_URL}examora-logo.jpeg`}
                      alt="Examora logo"
                      className="brand-logo"
                    />
                  <span>Examora</span>
                </Link>

                <nav className="nav-links" aria-label="Main navigation">
                  <a href="#home" onClick={(e) => {
                    e.preventDefault();
                    document.getElementById("home")?.scrollIntoView({ behavior: "smooth" });
                  }}>Home</a>

                  <a href="#about" onClick={(e) => {
                    e.preventDefault();
                    document.getElementById("about")?.scrollIntoView({ behavior: "smooth" });
                  }}>About</a>

                  <a href="#features" onClick={(e) => {
                    e.preventDefault();
                    document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
                  }}>Features</a>

                  <a href="#how-it-works" onClick={(e) => {
                    e.preventDefault();
                    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
                  }}>How It Works</a>
                </nav>

                <div className="nav-actions">
                  <button
                    type="button"
                    className="theme-toggle"
                    onClick={toggleTheme}
                    aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
                  >
                    {theme === "light" ? "🌙 Dark" : "☀️ Light"}
                  </button>

                  <Link className="nav-signup" to="/signin">
                    Sign In <span>↗</span>
                  </Link>
                </div>
              </div>
            </header>

            <Home />

            <footer className="footer">
              <div className="container footer-inner">
                <Link to="/" className="brand footer-brand" aria-label="Examora home">
                  <img
                    src={`${import.meta.env.BASE_URL}examora-logo.jpeg`}
                    alt="Examora logo"
                    className="brand-logo"
                  />
                  <span>Examora</span>
                </Link>

                <p>
                  Take Exams · Track Progress · Build Your Future
                </p>

                <span className="footer-credit">
                  Group N · Online Examination Platform
                </span>
              </div>
            </footer>
          </div>
        }
      />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/student/exams/:examId/attempt" element={<ProtectedRoute role="student"><StudentExamPage /></ProtectedRoute>} />
      <Route
        path="/student/*"
        element={<ProtectedRoute role="student"><StudentDashboard theme={theme} onToggleTheme={toggleTheme} /></ProtectedRoute>}
      />
      <Route path="/lecturer/*" element={<ProtectedRoute role="lecturer"><LecturerDashboard theme={theme} onToggleTheme={toggleTheme} /></ProtectedRoute>} />
      <Route path="/admin/*" element={<ProtectedRoute role="admin"><AdminPortal theme={theme} onToggleTheme={toggleTheme} /></ProtectedRoute>} />
      <Route path="/signup" element={<SignUpPlaceholder />} />
      <Route path="/forgot-password" element={<ForgotPasswordPlaceholder />} />
    </Routes>
  );
}

export default App;
