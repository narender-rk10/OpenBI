import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
  // Long-running ops (connection tests against slow/cold sources, KB ingestion,
  // exports) routinely exceed 30s. A short global cap aborted them mid-flight and
  // surfaced a spurious "timeout" error while the backend was still working. Use a
  // generous 120s default; callers with genuinely long jobs can override per-request.
  timeout: 120_000,
})

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('openbi_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Auto-logout on 401 — dispatch a custom event so AuthProvider can clear state
// and let React Router redirect without a hard page reload (which kills Vite HMR).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('openbi_token')
      localStorage.removeItem('openbi_user')
      window.dispatchEvent(new Event('openbi:unauthorized'))
    }
    return Promise.reject(error)
  }
)

export default api
