const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      credentials: "include",
      signal: controller.signal,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("The student service timed out. Check the backend and database connection.", { cause: error });
    }
    if (error instanceof TypeError) {
      error.message = "Unable to reach the student service. Check the backend connection.";
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "The student service request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function queryString(values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function getStudentProfile() {
  try {
    return await request("/api/student/profile");
  } catch (error) {
    // Some deployed API versions expose the verified session profile at /auth/me only.
    if (error.status !== 404) throw error;
    const session = await request("/api/auth/me");
    return { ...(session.user || session), studentId: null, programme: null };
  }
}
export const updateStudentProfile = (updates) => request("/api/student/profile", {
  method: "PATCH",
  body: JSON.stringify(updates),
});
export const getStudentDashboard = () => request("/api/student/dashboard");
export const getStudentExams = (filters = {}) => {
  const status = filters.status || "all";
  const endpoint = status === "all" ? "all" : status;
  const query = Object.fromEntries(Object.entries(filters).filter(([key]) => key !== "status"));
  return request(`/api/student/exams/${endpoint}${queryString(query)}`);
};
export const getStudentExam = (examId) => request(`/api/student/exams/${encodeURIComponent(examId)}`);
export const startStudentAttempt = (examId) => request(`/api/student/exams/${encodeURIComponent(examId)}/start`, { method: "POST" });
export const getStudentAttempt = (attemptId) => request(`/api/student/attempts/${encodeURIComponent(attemptId)}`);
export const saveStudentAnswer = (attemptId, questionId, answer) => request(`/api/student/attempts/${encodeURIComponent(attemptId)}/answer`, { method: "PATCH", body: JSON.stringify({ questionId, response: answer }) });
export const setStudentQuestionFlag = (attemptId, questionId, flagged) => request(`/api/student/attempts/${encodeURIComponent(attemptId)}/flags`, { method: "PATCH", body: JSON.stringify({ questionId, flagged }) });
export const recordStudentExamActivity = (attemptId, events) => request(`/api/student/attempts/${encodeURIComponent(attemptId)}/activity`, { method: "POST", body: JSON.stringify({ events }) });
export const submitStudentAttempt = (attemptId) => request(`/api/student/attempts/${encodeURIComponent(attemptId)}/submit`, { method: "POST" });
export const getStudentResults = (pagination) => request(`/api/student/results${queryString(pagination)}`);
export const getStudentAnalytics = () => request("/api/student/analytics");
export const getStudentNotifications = (filters) => request(`/api/student/notifications${queryString(filters)}`);
export const markStudentNotificationRead = (notificationId) => request(
  `/api/student/notifications/${encodeURIComponent(notificationId)}/read`,
  { method: "PATCH" }
);
export const markAllStudentNotificationsRead = () => request("/api/student/notifications/read-all", { method: "PATCH" });
export const logoutStudent = () => request("/api/auth/logout", { method: "POST" });
export const changeStudentPassword = (currentPassword, newPassword) => request("/api/auth/password", {
  method: "PATCH",
  body: JSON.stringify({ currentPassword, newPassword }),
});
