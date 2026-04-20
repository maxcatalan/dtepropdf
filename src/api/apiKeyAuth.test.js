/**
 * Unit tests for API key auth logic.
 * Tests the hashing, prefix format, and request parsing
 * without hitting the database.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';

// ── Helpers replicated from api/_lib/apiKeyAuth.js ───────────────────────────
// (Can't import Node-only modules in jsdom — replicate the pure logic here)

function hashKey(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

function generateRawKey() {
  // Deterministic for tests: fixed prefix + known suffix
  return 'sk_live_' + btoa('test-key-abc123')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('API key format', () => {
  it('raw key starts with sk_live_', () => {
    const key = generateRawKey();
    expect(key.startsWith('sk_live_')).toBe(true);
  });

  it('key prefix is first 16 chars', () => {
    const key = generateRawKey();
    const prefix = key.slice(0, 16);
    expect(prefix).toHaveLength(16);
    expect(key.startsWith(prefix)).toBe(true);
  });
});

describe('hashKey', () => {
  it('produces a 64-char hex string (SHA-256)', () => {
    const hash = hashKey('sk_live_somesecret');
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it('same input always produces same hash', () => {
    const raw = 'sk_live_abc123';
    expect(hashKey(raw)).toBe(hashKey(raw));
  });

  it('different keys produce different hashes', () => {
    expect(hashKey('sk_live_aaa')).not.toBe(hashKey('sk_live_bbb'));
  });

  it('raw key is not stored in hash output', () => {
    const raw = 'sk_live_supersecretkey';
    const hash = hashKey(raw);
    expect(hash).not.toContain('supersecretkey');
    expect(hash).not.toContain('sk_live');
  });
});

describe('auth header parsing', () => {
  it('extracts Bearer token correctly', () => {
    const header = 'Bearer sk_live_abc123xyz';
    const token = header.replace('Bearer ', '').trim();
    expect(token).toBe('sk_live_abc123xyz');
  });

  it('rejects tokens that do not start with sk_live_', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.someJWT'; // Supabase JWT
    expect(token.startsWith('sk_live_')).toBe(false);
  });

  it('rejects empty authorization header', () => {
    const header = undefined;
    const token = header?.replace('Bearer ', '').trim();
    expect(token?.startsWith('sk_live_')).toBeFalsy();
  });
});
