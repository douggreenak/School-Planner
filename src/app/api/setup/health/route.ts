// ============================================================
// GET /api/setup/health
// Live "can I actually query the Google Sheet right now?" check.
// This is different from GET /api/setup, which only reports whether
// credentials are PRESENT in config. This endpoint actually makes a
// sheets.spreadsheets.get call and reports the result.
// ============================================================
import { getConfigFromRequest } from '@/lib/config';
import { google } from 'googleapis';

// Lightweight in-memory cache so repeated polling doesn't hammer the Sheets API.
// A failed check is cached for 10s, a successful one for 30s. This is per-process
// and resets on server restart, which is fine for a personal-use app.
type CacheEntry = { at: number; ok: boolean; title?: string; error?: string };
let cache: CacheEntry | null = null;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  if (!force && cache) {
    const age = Date.now() - cache.at;
    const ttl = cache.ok ? 30_000 : 10_000;
    if (age < ttl) {
      return Response.json({ ...bodyFor(cache), cached: true, ageMs: age });
    }
  }

  const cfg = getConfigFromRequest(request);
  if (!cfg.googleServiceAccountEmail || !cfg.googlePrivateKey || !cfg.googleSpreadsheetId) {
    cache = { at: Date.now(), ok: false, error: 'Missing credentials' };
    return Response.json({ ...bodyFor(cache), cached: false });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: cfg.googleServiceAccountEmail,
        private_key: cfg.googlePrivateKey.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.get({ spreadsheetId: cfg.googleSpreadsheetId });
    const title = res.data.properties?.title || 'Untitled';
    cache = { at: Date.now(), ok: true, title };
    return Response.json({ ...bodyFor(cache), cached: false });
  } catch (err) {
    const message = (err as Error).message || 'Unknown error';
    cache = { at: Date.now(), ok: false, error: message };
    return Response.json({ ...bodyFor(cache), cached: false });
  }
}

function bodyFor(c: CacheEntry) {
  return {
    ok: c.ok,
    spreadsheetTitle: c.title,
    error: c.error,
    checkedAt: c.at,
  };
}
