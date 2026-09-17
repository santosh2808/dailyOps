import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4000",
});

api.interceptors.request.use((config) => {
  // Login's "Remember me" checkbox decides which of these actually has the
  // token (see AuthContext.login()) — check both so either case works.
  const token =
    localStorage.getItem("dailyops_token") || sessionStorage.getItem("dailyops_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Bug fix (TC-081): a 401 from any protected endpoint (JwtAuthGuard
// rejecting an expired/invalid token) previously had no central handling —
// each page's own try/catch just showed a generic "failed to load" error,
// leaving the user stuck on a broken page instead of being sent back to
// Login. AuthContext.loadProfile() already handles the initial-load case
// (a stale token found in storage on app boot) by clearing it and letting
// ProtectedRoute's own render logic redirect once `user` is null — this
// only needs to cover the other case: a token that expires while the user
// is actively on a protected page, mid-session, where no re-render is
// coming on its own. Excludes /auth/* — /auth/login's 401 means "wrong
// credentials", not "your session expired", and must stay on the Login
// page to show that error normally.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url ?? "";
    if (status === 401 && !url.startsWith("/auth/")) {
      localStorage.removeItem("dailyops_token");
      sessionStorage.removeItem("dailyops_token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
