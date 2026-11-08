const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL;
const productionFallback = "https://examora-backend-n3yu.onrender.com";

export const apiBaseUrl = (configuredBaseUrl || (import.meta.env.PROD ? productionFallback : "")).replace(/\/+$/, "");

export async function apiFetch(path, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      credentials: "include",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("The authentication service took too long to respond. Please try again.", { cause: error });
    }
    if (error instanceof TypeError) {
      throw new Error("Unable to reach the Examora service. Check your connection and try again.", { cause: error });
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function apiFetchJson(path, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      credentials: "include",
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("The authentication service took too long to respond. Please try again.", { cause: error });
    }
    if (error instanceof TypeError) {
      throw new Error("Unable to reach the Examora service. Check your connection and try again.", { cause: error });
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
