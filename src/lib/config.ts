// ============================================================
// Local Server Configuration
// Reads from a local config.json file AND env vars.
// The web UI can write credentials here so the user never
// has to edit .env.local by hand.
// ============================================================
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const CONFIG_PATH = join(process.cwd(), 'config.json');

export interface ServerConfig {
  googleServiceAccountEmail?: string;
  googlePrivateKey?: string;
  googleSpreadsheetId?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  calendarSecretToken?: string;
  // PowerSchool — saved so the user doesn't re-enter on every import
  powerschoolUrl?: string;
  powerschoolUsername?: string;
  powerschoolPassword?: string;
}

function readConfigFile(): ServerConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch {
    // ignore parse errors
  }
  return {};
}

export function writeConfigFile(updates: Partial<ServerConfig>) {
  const current = readConfigFile();
  const merged = { ...current, ...updates };
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
}

/**
 * Resolve a config value: config.json takes priority, then env vars.
 */
export function getConfig(): ServerConfig {
  const file = readConfigFile();
  return {
    googleServiceAccountEmail:
      file.googleServiceAccountEmail || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    googlePrivateKey:
      file.googlePrivateKey || process.env.GOOGLE_PRIVATE_KEY || '',
    googleSpreadsheetId:
      file.googleSpreadsheetId || process.env.GOOGLE_SPREADSHEET_ID || '',
    googleClientId:
      file.googleClientId || process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret:
      file.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET || '',
    calendarSecretToken:
      file.calendarSecretToken || process.env.CALENDAR_SECRET_TOKEN || '',
    powerschoolUrl:
      file.powerschoolUrl || process.env.POWERSCHOOL_URL || '',
    powerschoolUsername:
      file.powerschoolUsername || process.env.POWERSCHOOL_USERNAME || '',
    powerschoolPassword:
      file.powerschoolPassword || process.env.POWERSCHOOL_PASSWORD || '',
  };
}

/**
 * Check whether the minimum required config is present to connect to Sheets.
 */
export function isConfigured(): { configured: boolean; missing: string[] } {
  const cfg = getConfig();
  const missing: string[] = [];
  if (!cfg.googleServiceAccountEmail) missing.push('Service Account Email');
  if (!cfg.googlePrivateKey) missing.push('Service Account Private Key');
  if (!cfg.googleSpreadsheetId) missing.push('Spreadsheet ID');
  return { configured: missing.length === 0, missing };
}
