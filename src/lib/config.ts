// ============================================================
// Local Server Configuration
// Priority order for each value: config.json / /tmp > cookie > env var.
//
// In read-only serverless environments (Vercel/Lambda) the primary
// config.json path is not writable. In that case we fall back to /tmp
// (writable but ephemeral per Lambda instance). To survive across cold
// starts we also persist the config in an httpOnly cookie on the
// browser — call `getConfigFromRequest(request)` in route handlers so
// the cookie is included as a fallback tier.
// ============================================================
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { NextRequest } from 'next/server';

const CONFIG_PATH = join(process.cwd(), 'config.json');
const TMP_CONFIG_PATH = '/tmp/school-planner-config.json';
export const CONFIG_COOKIE = 'sp-config';

export interface ServerConfig {
  googleServiceAccountEmail?: string;
  googlePrivateKey?: string;
  googleSpreadsheetId?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  calendarSecretToken?: string;
  powerschoolUrl?: string;
  powerschoolUsername?: string;
  powerschoolPassword?: string;
}

// In-memory cache — survives repeated calls within one Lambda instance.
let memoryConfig: ServerConfig | null = null;

function readConfigFile(): ServerConfig {
  if (memoryConfig) return memoryConfig;
  for (const path of [CONFIG_PATH, TMP_CONFIG_PATH]) {
    try {
      if (existsSync(path)) {
        const parsed = JSON.parse(readFileSync(path, 'utf-8')) as ServerConfig;
        memoryConfig = parsed;
        return parsed;
      }
    } catch {
      // ignore and try next path
    }
  }
  return {};
}

export function writeConfigFile(updates: Partial<ServerConfig>) {
  const current = readConfigFile();
  const merged = { ...current, ...updates };
  memoryConfig = merged;

  // Try the primary location (works locally and in writable containers).
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
    return;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EROFS') throw e;
  }

  // Read-only filesystem — write to /tmp instead.
  writeFileSync(TMP_CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
}

// ---- Cookie helpers ----

/** Encode a config as a base64 cookie value. */
export function encodeConfigCookie(cfg: ServerConfig): string {
  return Buffer.from(JSON.stringify(cfg)).toString('base64');
}

/** Decode a config from a base64 cookie value. Returns {} on any error. */
function decodeConfigCookie(value: string): ServerConfig {
  try {
    return JSON.parse(Buffer.from(value, 'base64').toString('utf-8')) as ServerConfig;
  } catch {
    return {};
  }
}

/** Return the Set-Cookie header string for the config cookie. */
export function buildConfigCookieHeader(cfg: ServerConfig): string {
  const encoded = encodeConfigCookie(cfg);
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  return `${CONFIG_COOKIE}=${encoded}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}`;
}

// ---- Config resolution ----

function merge(file: ServerConfig, cookie: ServerConfig): ServerConfig {
  return {
    googleServiceAccountEmail:
      file.googleServiceAccountEmail || cookie.googleServiceAccountEmail || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    googlePrivateKey:
      file.googlePrivateKey || cookie.googlePrivateKey || process.env.GOOGLE_PRIVATE_KEY || '',
    googleSpreadsheetId:
      file.googleSpreadsheetId || cookie.googleSpreadsheetId || process.env.GOOGLE_SPREADSHEET_ID || '',
    googleClientId:
      file.googleClientId || cookie.googleClientId || process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret:
      file.googleClientSecret || cookie.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET || '',
    calendarSecretToken:
      file.calendarSecretToken || cookie.calendarSecretToken || process.env.CALENDAR_SECRET_TOKEN || '',
    powerschoolUrl:
      file.powerschoolUrl || cookie.powerschoolUrl || process.env.POWERSCHOOL_URL || '',
    powerschoolUsername:
      file.powerschoolUsername || cookie.powerschoolUsername || process.env.POWERSCHOOL_USERNAME || '',
    powerschoolPassword:
      file.powerschoolPassword || cookie.powerschoolPassword || process.env.POWERSCHOOL_PASSWORD || '',
  };
}

/** Resolve config without a request (no cookie tier). Use in non-route contexts. */
export function getConfig(): ServerConfig {
  return merge(readConfigFile(), {});
}

/** Resolve config with a request so the cookie tier is included. Use in route handlers. */
export function getConfigFromRequest(request: NextRequest | Request): ServerConfig {
  const file = readConfigFile();
  // NextRequest has a .cookies property; plain Request requires manual parsing.
  let cookieValue: string | undefined;
  if ('cookies' in request && typeof (request as NextRequest).cookies?.get === 'function') {
    cookieValue = (request as NextRequest).cookies.get(CONFIG_COOKIE)?.value;
  } else {
    const header = request.headers.get('cookie') ?? '';
    const match = header.match(new RegExp(`(?:^|;\\s*)${CONFIG_COOKIE}=([^;]*)`));
    cookieValue = match?.[1];
  }
  const cookie = cookieValue ? decodeConfigCookie(cookieValue) : {};
  // Also warm the memory cache if the file tier was empty.
  if (!memoryConfig && Object.keys(cookie).length > 0) {
    memoryConfig = cookie as ServerConfig;
  }
  return merge(file, cookie);
}

/** Check whether the minimum required config is present (no request — for boot checks). */
export function isConfigured(): { configured: boolean; missing: string[] } {
  return isConfiguredWith(getConfig());
}

/** Check whether the minimum required config is present given a request. */
export function isConfiguredFromRequest(request: NextRequest | Request): { configured: boolean; missing: string[] } {
  return isConfiguredWith(getConfigFromRequest(request));
}

function isConfiguredWith(cfg: ServerConfig): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!cfg.googleServiceAccountEmail) missing.push('Service Account Email');
  if (!cfg.googlePrivateKey) missing.push('Service Account Private Key');
  if (!cfg.googleSpreadsheetId) missing.push('Spreadsheet ID');
  return { configured: missing.length === 0, missing };
}
