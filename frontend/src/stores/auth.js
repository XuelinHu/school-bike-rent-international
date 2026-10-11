import { reactive } from 'vue';
import { request } from '../api/client.js';

export const authStore = reactive({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  get isAuthed() {
    return Boolean(localStorage.getItem('token'));
  },
  async login(form) {
    const data = await request('/auth/login', { method: 'POST', body: form });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    this.user = data.user;
  },
  async loginWithOidc(accessToken) {
    const data = await request('/auth/oidc', { method: 'POST', body: { accessToken } });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    this.user = data.user;
    return data.user;
  },
  async linkOidc(accessToken) {
    return request('/auth/oidc/link', { method: 'POST', body: { accessToken } });
  },
  async oidcLinked() {
    return request('/auth/oidc/status');
  },
  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.user = null;
  }
});
