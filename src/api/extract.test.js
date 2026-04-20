/**
 * Tests for the /api/extract endpoint logic.
 * Mocks DB and Gemini — validates routing, error handling, and response shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Minimal request/response shims ───────────────────────────────────────────

function makeReq(method, body = {}, headers = {}) {
  return { method, body, headers, query: {} };
}

function makeRes() {
  const r = { _code: 200, _body: null };
  r.status = (c) => { r._code = c; return r; };
  r.json   = (d) => { r._body = d; return r; };
  r.end    = ()  => r;
  return r;
}

// ── Mock modules ─────────────────────────────────────────────────────────────

vi.mock('../../api/_lib/apiKeyAuth.js', () => ({
  getApiKeyUser: vi.fn(),
}));

vi.mock('../../api/_lib/supabaseAdmin.js', () => ({
  makeSupabaseAdmin: vi.fn(),
  refundOcrCredit: vi.fn(),
}));

vi.mock('../../api/_lib/gemini.js', () => ({
  callGemini: vi.fn(),
  buildCustomPrompt: vi.fn(() => 'mock-prompt'),
  buildGenericPrompt: vi.fn(() => 'mock-generic-prompt'),
  tableArrayToResult: vi.fn(() => ({ headers: ['Col A', 'Col B'], rows: [['1', '2']] })),
  applyPostPrompt: vi.fn(async (result) => result),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQuery(result) {
  return {
    select: vi.fn(() => makeQuery(result)),
    eq: vi.fn(() => makeQuery(result)),
    single: vi.fn(async () => result),
    insert: vi.fn(() => makeQuery(result)),
  };
}

function makeSupabaseMock({
  consumed = true,
  userCredits = { data: { api_mode: 'auto' }, error: null },
  extractionConfigs = { data: [], error: null },
} = {}) {
  const usageLogQuery = makeQuery({ data: null, error: null });
  const configListQuery = {
    select: vi.fn(() => ({
      eq: vi.fn(async () => extractionConfigs),
    })),
  };
  const creditsQuery = makeQuery(userCredits);

  return {
    rpc: vi.fn(async () => ({ data: consumed, error: null })),
    from: vi.fn((table) => {
      if (table === 'user_credits') return creditsQuery;
      if (table === 'extraction_configs') return configListQuery;
      if (table === 'usage_log') return usageLogQuery;
      return makeQuery({ data: null, error: null });
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('/api/extract — auth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 405 for non-POST methods', async () => {
    const { default: handler } = await import('../../api/extract.js');
    const res = makeRes();
    await handler(makeReq('GET'), res);
    expect(res._code).toBe(405);
  });

  it('returns 401 when API key is invalid', async () => {
    const { getApiKeyUser } = await import('../../api/_lib/apiKeyAuth.js');
    getApiKeyUser.mockResolvedValue(null);

    const { default: handler } = await import('../../api/extract.js');
    const res = makeRes();
    await handler(makeReq('POST', { fileData: 'abc', mimeType: 'image/jpeg' }, {
      authorization: 'Bearer invalid-key',
    }), res);
    expect(res._code).toBe(401);
    expect(res._body.error).toMatch(/api key/i);
  });

  it('returns 400 when fileData is missing', async () => {
    const { getApiKeyUser } = await import('../../api/_lib/apiKeyAuth.js');
    getApiKeyUser.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });

    const { makeSupabaseAdmin } = await import('../../api/_lib/supabaseAdmin.js');
    makeSupabaseAdmin.mockReturnValue(makeSupabaseMock({ consumed: true }));

    const { default: handler } = await import('../../api/extract.js');
    const res = makeRes();
    await handler(makeReq('POST', { mimeType: 'image/jpeg' }), res);
    expect(res._code).toBe(400);
    expect(res._body.error).toMatch(/fileData/i);
  });

  it('returns 402 when no credits', async () => {
    const { getApiKeyUser } = await import('../../api/_lib/apiKeyAuth.js');
    getApiKeyUser.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });

    const { makeSupabaseAdmin } = await import('../../api/_lib/supabaseAdmin.js');
    makeSupabaseAdmin.mockReturnValue(makeSupabaseMock({ consumed: false }));

    const { default: handler } = await import('../../api/extract.js');
    const res = makeRes();
    await handler(makeReq('POST', { fileData: 'abc', mimeType: 'image/jpeg' }), res);
    expect(res._code).toBe(402);
  });
});

describe('/api/extract — generic extraction (no configId)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns headers + rows + meta on success', async () => {
    const { getApiKeyUser } = await import('../../api/_lib/apiKeyAuth.js');
    getApiKeyUser.mockResolvedValue({ userId: 'user-1', keyId: 'key-1' });

    const { makeSupabaseAdmin } = await import('../../api/_lib/supabaseAdmin.js');
    const supabase = makeSupabaseMock({ consumed: true });
    makeSupabaseAdmin.mockReturnValue(supabase);

    const { callGemini, tableArrayToResult } = await import('../../api/_lib/gemini.js');
    callGemini.mockResolvedValue({
      campos: [
        { campo: 'folio', valor: 'F-001' },
        { campo: 'total', valor: '$100' },
      ],
      tabla: [{ A: '1', B: '2' }],
    });
    tableArrayToResult.mockReturnValue({ headers: ['A', 'B'], rows: [['1', '2']] });

    const { default: handler } = await import('../../api/extract.js');
    const res = makeRes();
    await handler(makeReq('POST', { fileData: 'base64data', mimeType: 'image/jpeg' }), res);

    expect(res._code).toBe(200);
    expect(res._body).toMatchObject({
      headers: expect.any(Array),
      rows: expect.any(Array),
      meta: expect.any(Object),
    });
  });
});

describe('/api/extract — response shape contract', () => {
  it('response always has headers, rows, meta keys', async () => {
    const result = { headers: ['A'], rows: [['1']], meta: { folio: 'F-001' } };
    expect(result).toHaveProperty('headers');
    expect(result).toHaveProperty('rows');
    expect(result).toHaveProperty('meta');
    expect(Array.isArray(result.headers)).toBe(true);
    expect(Array.isArray(result.rows)).toBe(true);
    expect(typeof result.meta).toBe('object');
  });

  it('each row has same length as headers', () => {
    const headers = ['Código', 'Descripción', 'Precio'];
    const rows = [
      ['001', 'Tornillo M6', '$0.05'],
      ['002', 'Tuerca M6',   '$0.03'],
    ];
    rows.forEach(row => expect(row).toHaveLength(headers.length));
  });
});
