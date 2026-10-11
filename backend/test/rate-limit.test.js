import assert from 'node:assert/strict';
import test from 'node:test';
import { clientIp, createLimiter } from '../src/utils/rateLimit.js';

test('client identity ignores client-supplied forwarded IP headers', () => {
  const request = {
    headers: { 'x-forwarded-for': '198.51.100.44' },
    ip: '203.0.113.9',
    socket: { remoteAddress: '192.0.2.17' }
  };

  assert.equal(clientIp(request), '192.0.2.17');
});

test('spoofed forwarded IPs cannot split one peer across rate-limit buckets', () => {
  const limit = createLimiter({ windowMs: 60_000, max: 2 });
  const peer = '192.0.2.17';
  const first = clientIp({ socket: { remoteAddress: peer }, headers: { 'x-forwarded-for': '198.51.100.1' } });
  const second = clientIp({ socket: { remoteAddress: peer }, headers: { 'x-forwarded-for': '198.51.100.2' } });
  const third = clientIp({ socket: { remoteAddress: peer }, headers: { 'x-forwarded-for': '198.51.100.3' } });

  assert.equal(limit(first).allowed, true);
  assert.equal(limit(second).allowed, true);
  assert.equal(limit(third).allowed, false);
});
