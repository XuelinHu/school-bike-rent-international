import dotenv from 'dotenv';
import { createRemoteJWKSet, jwtVerify } from 'jose';

dotenv.config();

export const OIDC_ISSUER = process.env.OIDC_ISSUER || 'https://192.168.1.9:8042/realms/front';
export const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID || 'school-bike-rent-web';

let remoteJwks;

export async function verifyOidcAccessToken(token, options = {}) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 16_384) throw new Error('Invalid identity token');
  const issuer = options.issuer || OIDC_ISSUER;
  const clientId = options.clientId || OIDC_CLIENT_ID;
  const jwks = options.jwks || (remoteJwks ||= createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`)));
  const { payload } = await jwtVerify(token, jwks, { issuer, audience: 'account', algorithms: ['RS256'] });
  if (payload.azp !== clientId || typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('Identity token is not issued for this application');
  }
  return { subject: payload.sub };
}
