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

export default api;
