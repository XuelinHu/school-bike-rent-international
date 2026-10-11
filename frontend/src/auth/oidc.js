import Keycloak from 'keycloak-js';

const issuer = import.meta.env.VITE_OIDC_ISSUER || 'https://192.168.1.9:8042/realms/front';
const clientId = import.meta.env.VITE_OIDC_CLIENT_ID || 'school-bike-rent-web';
const realmBase = issuer.replace(/\/realms\/[^/]+\/?$/, '');

export const oidc = new Keycloak({ url: realmBase, realm: 'front', clientId });

export async function initializeOidc() {
  const authenticated = await oidc.init({ checkLoginIframe: false, pkceMethod: 'S256' });
  if (authenticated) await oidc.updateToken(30);
  return authenticated;
}

export function beginOidcLogin({ link = false } = {}) {
  sessionStorage.setItem(link ? 'oidc-link-pending' : 'oidc-login-pending', '1');
  return oidc.login({ redirectUri: window.location.href });
}
