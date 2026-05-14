const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api';

export function token() {
  return localStorage.getItem('token') || '';
}

export async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({ message: 'Network error' }));
  if (!response.ok || payload.code >= 400) throw new Error(payload.message || 'Request failed');
  return payload.data;
}
