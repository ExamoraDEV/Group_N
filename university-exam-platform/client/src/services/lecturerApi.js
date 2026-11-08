import { apiFetch, apiBaseUrl } from "./apiClient";
export { apiBaseUrl };

const API = "/api/lecturer";

export async function lecturerRequest(path, options = {}) {
  const requestUrl = path.startsWith("/auth/") ? `/api${path}` : `${API}${path}`;
  const response = await apiFetch(requestUrl, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.assign("/signin");
    throw new Error(data.message || "Your session has expired.");
  }
  if (response.status === 403) {
    throw new Error(data.message || "Lecturer access is required.");
  }
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`);
  return data;
}

export const sendJson = (method, body) => ({ method, body: JSON.stringify(body) });
