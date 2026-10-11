import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { verifyOidcAccessToken } from '../src/auth/oidc.js';

const issuer = 'https://identity.example.test/realms/front';
const clientId = 'school-bike-rent-web';
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
Object.assign(jwk, { kid: 'test-key', alg: 'RS256', use: 'sig' });
const jwks = createLocalJWKSet({ keys: [jwk] });

async function token(claims = {}, tokenIssuer = issuer) {
  return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(tokenIssuer).setAudience('account').setSubject('subject-123')
    .setIssuedAt().setExpirationTime('2m').sign(privateKey);
}

const options = { issuer, clientId, jwks };

test('accepts a signed token for the configured identity client', async () => {
  assert.deepEqual(await verifyOidcAccessToken(await token({ azp: clientId }), options), { subject: 'subject-123' });
});

test('rejects invalid client, issuer, audience, expiry and malformed tokens', async () => {
  await assert.rejects(verifyOidcAccessToken(await token({ azp: 'another-client' }), options));
  await assert.rejects(verifyOidcAccessToken(await token({ azp: clientId }, 'https://other.example.test'), options));
  const wrongAudience = new SignJWT({ azp: clientId }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(issuer).setAudience('another-audience').setSubject('subject-123').setIssuedAt().setExpirationTime('2m').sign(privateKey);
  await assert.rejects(verifyOidcAccessToken(await wrongAudience, options));
  const expired = new SignJWT({ azp: clientId }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(issuer).setAudience('account').setSubject('subject-123').setIssuedAt().setExpirationTime('-1s').sign(privateKey);
  await assert.rejects(verifyOidcAccessToken(await expired, options));
  await assert.rejects(verifyOidcAccessToken('not-a-token', options));
});
