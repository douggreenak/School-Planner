import { NextRequest } from 'next/server';
import { getConfigFromRequest, writeConfigFile, isConfiguredFromRequest, buildConfigCookieHeader, CONFIG_COOKIE } from '@/lib/config';
import { encrypt, decrypt } from '@/lib/crypto';
import { google } from 'googleapis';

function withCookie(data: unknown, cookieHeader: string): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookieHeader },
  });
}

export async function GET(request: Request) {
  const { configured, missing } = isConfiguredFromRequest(request);
  const cfg = getConfigFromRequest(request);
  return Response.json({
    configured,
    missing,
    hasServiceAccount: !!cfg.googleServiceAccountEmail,
    serviceAccountEmail: cfg.googleServiceAccountEmail || '',
    hasSpreadsheet: !!cfg.googleSpreadsheetId,
    spreadsheetId: cfg.googleSpreadsheetId || '',
    hasClassroomOAuth: !!cfg.googleClientId,
    // PowerSchool — safe to expose URL + username, NEVER the password
    hasPowerschool: !!cfg.powerschoolPassword,
    powerschoolUrl: cfg.powerschoolUrl || '',
    powerschoolUsername: cfg.powerschoolUsername || '',
  });
}

// --------------- helpers ---------------

const REQUIRED_SHEETS: { name: string; headers: string[] }[] = [
  {
    name: 'Classes',
    headers: ['id', 'name', 'teacher', 'room', 'color', 'period', 'startTime', 'endTime', 'days', 'dayTimes', 'semester', 'source', 'sourceId', 'grade', 'gradePercent'],
  },
  {
    name: 'Homework',
    headers: ['id', 'classId', 'title', 'description', 'dueDate', 'completed', 'priority', 'source', 'sourceId', 'score', 'category', 'flags', 'scorePercent'],
  },
  {
    name: 'Exams',
    headers: ['id', 'classId', 'title', 'date', 'startTime', 'endTime', 'location', 'notes'],
  },
  {
    name: 'Tasks',
    headers: ['id', 'title', 'description', 'dueDate', 'completed', 'priority', 'category', 'classId'],
  },
  {
    name: 'Disruptions',
    headers: ['id', 'date', 'type', 'label', 'periodOverrides'],
  },
  {
    name: 'Settings',
    headers: ['key', 'value'],
  },
];

async function initializeSheetTabs(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
) {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = spreadsheet.data.sheets?.map((s) => s.properties?.title) ?? [];
  const created: string[] = [];
  const migrated: string[] = [];

  for (const { name, headers } of REQUIRED_SHEETS) {
    if (!existing.includes(name)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: name } } }] },
      });
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${name}!A:Z`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [headers] },
      });
      created.push(name);
      continue;
    }

    // Schema migration: if the existing sheet has fewer columns than we now require,
    // extend the header row so new columns are present. This is safe — existing rows
    // will just have empty cells in the new columns, which our row-parse defaults handle.
    try {
      const headerRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${name}!1:1`,
      });
      const currentHeaders = (headerRes.data.values?.[0] as string[]) || [];
      if (currentHeaders.length < headers.length) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${name}!A1:${columnLetter(headers.length)}1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [headers] },
        });
        migrated.push(name);
      }
    } catch {
      // non-fatal — the sheet might be empty
    }
  }

  return { created, migrated };
}

// A1-notation column letter for a 1-based column index (e.g. 1 → A, 27 → AA).
function columnLetter(col: number): string {
  let s = '';
  while (col > 0) {
    const rem = (col - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
}

// --------------- POST ---------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // ====== Save credentials, test, and auto-initialize ======
    if (action === 'save-credentials') {
      const { serviceAccountEmail, privateKey, spreadsheetId } = body;

      if (!serviceAccountEmail || !privateKey || !spreadsheetId) {
        return Response.json({ success: false, error: 'All three fields are required.' });
      }

      // 1. Save to config.json
      writeConfigFile({
        googleServiceAccountEmail: serviceAccountEmail,
        googlePrivateKey: privateKey,
        googleSpreadsheetId: spreadsheetId,
      });

      // 2. Test the connection
      try {
        const auth = new google.auth.GoogleAuth({
          credentials: {
            client_email: serviceAccountEmail,
            private_key: privateKey.replace(/\\n/g, '\n'),
          },
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const res = await sheets.spreadsheets.get({ spreadsheetId });
        const title = res.data.properties?.title || 'Untitled';

        // 3. Auto-initialize all required tabs + migrate headers for existing tabs
        const { created, migrated } = await initializeSheetTabs(sheets, spreadsheetId);

        const messageParts: string[] = [`Connected to "${title}"`];
        if (created.length > 0) messageParts.push(`created tabs: ${created.join(', ')}`);
        if (migrated.length > 0) messageParts.push(`migrated headers: ${migrated.join(', ')}`);
        if (created.length === 0 && migrated.length === 0) messageParts.push('all tabs ready');

        return withCookie(
          { success: true, spreadsheetTitle: title, tabsCreated: created, tabsMigrated: migrated, message: messageParts.join(' — ') },
          buildConfigCookieHeader(getConfigFromRequest(request)),
        );
      } catch (err) {
        const msg = (err as Error).message;
        let hint = '';
        if (msg.includes('not found')) {
          hint = 'The spreadsheet ID is wrong, or the service account does not have access. Make sure you shared the sheet with the service account email.';
        } else if (msg.includes('invalid_grant') || msg.includes('JWT')) {
          hint = 'The private key is invalid. Make sure you copied the entire key including the BEGIN/END lines.';
        } else if (msg.includes('PERMISSION_DENIED')) {
          hint = 'The service account does not have permission. Share your Google Sheet with the service account email as an Editor.';
        }
        return Response.json({ success: false, error: msg, hint: hint || 'Credentials were saved but the connection test failed. Double-check each value.' });
      }
    }

    // ====== Save PowerSchool credentials ======
    if (action === 'save-powerschool') {
      const { url, username, password } = body;
      if (!url || !username || !password) {
        return Response.json({ success: false, error: 'URL, username, and password are all required.' });
      }
      writeConfigFile({ powerschoolUrl: url, powerschoolUsername: username, powerschoolPassword: password });
      return withCookie({ success: true }, buildConfigCookieHeader(getConfigFromRequest(request)));
    }

    // ====== Clear saved PowerSchool credentials ======
    if (action === 'clear-powerschool') {
      writeConfigFile({ powerschoolUrl: '', powerschoolUsername: '', powerschoolPassword: '' });
      return withCookie({ success: true }, buildConfigCookieHeader(getConfigFromRequest(request)));
    }

    // ====== Save Classroom OAuth ======
    if (action === 'save-classroom-oauth') {
      const { clientId, clientSecret } = body;
      writeConfigFile({ googleClientId: clientId, googleClientSecret: clientSecret });
      return withCookie({ success: true }, buildConfigCookieHeader(getConfigFromRequest(request)));
    }

    // ====== Test connection (standalone, for re-checking) ======
    if (action === 'test-connection') {
      const cfg = getConfigFromRequest(request);
      if (!cfg.googleServiceAccountEmail || !cfg.googlePrivateKey || !cfg.googleSpreadsheetId) {
        return Response.json({ success: false, error: 'Missing credentials. Save them first.' });
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
        const res = await sheets.spreadsheets.get({
          spreadsheetId: cfg.googleSpreadsheetId,
        });
        const title = res.data.properties?.title || 'Untitled';
        return Response.json({ success: true, spreadsheetTitle: title });
      } catch (err) {
        return Response.json({ success: false, error: (err as Error).message });
      }
    }

    // ====== Export all non-spreadsheet config as plain JSON ======
    if (action === 'export-config') {
      const cfg = getConfigFromRequest(request);
      if (!cfg.googleServiceAccountEmail || !cfg.googlePrivateKey || !cfg.googleSpreadsheetId) {
        return Response.json({ success: false, error: 'No credentials saved yet. Set up Google Sheets first.' });
      }
      const exportData: Record<string, string> = {
        v: '1',
        serviceAccountEmail: cfg.googleServiceAccountEmail,
        privateKey: cfg.googlePrivateKey,
        spreadsheetId: cfg.googleSpreadsheetId,
      };
      if (cfg.googleClientId) exportData.classroomClientId = cfg.googleClientId;
      if (cfg.googleClientSecret) exportData.classroomClientSecret = cfg.googleClientSecret;
      if (cfg.powerschoolUrl) exportData.powerschoolUrl = cfg.powerschoolUrl;
      if (cfg.powerschoolUsername) exportData.powerschoolUsername = cfg.powerschoolUsername;
      if (cfg.powerschoolPassword) exportData.powerschoolPassword = cfg.powerschoolPassword;
      return Response.json({ success: true, config: exportData });
    }

    // ====== Import all non-spreadsheet config from plain JSON ======
    if (action === 'import-config') {
      const { config } = body as { config: Record<string, string> };
      if (!config || !config.serviceAccountEmail || !config.privateKey || !config.spreadsheetId) {
        return Response.json({ success: false, error: 'Config JSON is missing required fields (serviceAccountEmail, privateKey, spreadsheetId).' });
      }

      const configUpdate: Record<string, string> = {
        googleServiceAccountEmail: config.serviceAccountEmail,
        googlePrivateKey: config.privateKey,
        googleSpreadsheetId: config.spreadsheetId,
      };
      if (config.classroomClientId) configUpdate.googleClientId = config.classroomClientId;
      if (config.classroomClientSecret) configUpdate.googleClientSecret = config.classroomClientSecret;
      if (config.powerschoolUrl) configUpdate.powerschoolUrl = config.powerschoolUrl;
      if (config.powerschoolUsername) configUpdate.powerschoolUsername = config.powerschoolUsername;
      if (config.powerschoolPassword) configUpdate.powerschoolPassword = config.powerschoolPassword;
      writeConfigFile(configUpdate);

      // Test connection + auto-initialize sheets
      try {
        const auth = new google.auth.GoogleAuth({
          credentials: {
            client_email: config.serviceAccountEmail,
            private_key: config.privateKey.replace(/\\n/g, '\n'),
          },
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const res = await sheets.spreadsheets.get({ spreadsheetId: config.spreadsheetId });
        const title = res.data.properties?.title || 'Untitled';
        const { created, migrated } = await initializeSheetTabs(sheets, config.spreadsheetId);
        const messageParts = [`Connected to "${title}"`];
        if (created.length > 0) messageParts.push(`created tabs: ${created.join(', ')}`);
        if (migrated.length > 0) messageParts.push(`migrated headers: ${migrated.join(', ')}`);
        if (created.length === 0 && migrated.length === 0) messageParts.push('all tabs ready');
        return withCookie(
          { success: true, spreadsheetTitle: title, message: messageParts.join(' — ') },
          buildConfigCookieHeader(getConfigFromRequest(request)),
        );
      } catch (err) {
        return Response.json({ success: false, error: (err as Error).message, hint: 'Credentials were applied but the connection test failed. Check that the service account still has access to the spreadsheet.' });
      }
    }

    // ====== Generate a portable Setup Code (legacy encrypted method) ======
    if (action === 'generate-setup-code') {
      const { passphrase } = body;
      if (!passphrase || passphrase.length < 4) {
        return Response.json({ success: false, error: 'Passphrase must be at least 4 characters.' });
      }
      const cfg = getConfigFromRequest(request);
      if (!cfg.googleServiceAccountEmail || !cfg.googlePrivateKey || !cfg.googleSpreadsheetId) {
        return Response.json({ success: false, error: 'No credentials saved yet. Set up Google Sheets first.' });
      }

      const payload = JSON.stringify({
        e: cfg.googleServiceAccountEmail,
        k: cfg.googlePrivateKey,
        s: cfg.googleSpreadsheetId,
        // Include Classroom OAuth creds if present
        ...(cfg.googleClientId ? { ci: cfg.googleClientId } : {}),
        ...(cfg.googleClientSecret ? { cs: cfg.googleClientSecret } : {}),
        // Include PowerSchool creds if present
        ...(cfg.powerschoolUrl ? { pu: cfg.powerschoolUrl } : {}),
        ...(cfg.powerschoolUsername ? { pn: cfg.powerschoolUsername } : {}),
        ...(cfg.powerschoolPassword ? { pp: cfg.powerschoolPassword } : {}),
      });

      const code = encrypt(payload, passphrase);
      // Prefix with "SP1-" so it's identifiable as a School Planner setup code
      return Response.json({ success: true, setupCode: `SP1-${code}` });
    }

    // ====== Restore credentials from a Setup Code (legacy encrypted method) ======
    if (action === 'use-setup-code') {
      const { setupCode, passphrase } = body;
      if (!setupCode || !passphrase) {
        return Response.json({ success: false, error: 'Setup code and passphrase are required.' });
      }

      // Strip the "SP1-" prefix
      const raw = setupCode.startsWith('SP1-') ? setupCode.slice(4) : setupCode;

      let payload: { e: string; k: string; s: string; ci?: string; cs?: string; pu?: string; pn?: string; pp?: string };
      try {
        payload = JSON.parse(decrypt(raw, passphrase));
      } catch (err) {
        return Response.json({
          success: false,
          error: (err as Error).message || 'Invalid setup code or wrong passphrase.',
        });
      }

      if (!payload.e || !payload.k || !payload.s) {
        return Response.json({ success: false, error: 'Setup code is missing required credential fields.' });
      }

      // 1. Save all credentials to config.json
      const configUpdate: Record<string, string> = {
        googleServiceAccountEmail: payload.e,
        googlePrivateKey: payload.k,
        googleSpreadsheetId: payload.s,
      };
      if (payload.ci) configUpdate.googleClientId = payload.ci;
      if (payload.cs) configUpdate.googleClientSecret = payload.cs;
      if (payload.pu) configUpdate.powerschoolUrl = payload.pu;
      if (payload.pn) configUpdate.powerschoolUsername = payload.pn;
      if (payload.pp) configUpdate.powerschoolPassword = payload.pp;
      writeConfigFile(configUpdate);

      // 2. Test + auto-initialize
      try {
        const auth = new google.auth.GoogleAuth({
          credentials: {
            client_email: payload.e,
            private_key: payload.k.replace(/\\n/g, '\n'),
          },
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const res = await sheets.spreadsheets.get({ spreadsheetId: payload.s });
        const title = res.data.properties?.title || 'Untitled';

        const { created, migrated } = await initializeSheetTabs(sheets, payload.s);

        const messageParts: string[] = [`Connected to "${title}"`];
        if (created.length > 0) messageParts.push(`created tabs: ${created.join(', ')}`);
        if (migrated.length > 0) messageParts.push(`migrated headers: ${migrated.join(', ')}`);
        if (created.length === 0 && migrated.length === 0) messageParts.push('all tabs ready');

        return withCookie(
          { success: true, spreadsheetTitle: title, tabsCreated: created, tabsMigrated: migrated, hasClassroomOAuth: !!payload.ci, hasPowerschool: !!payload.pp, message: messageParts.join(' — ') },
          buildConfigCookieHeader(getConfigFromRequest(request)),
        );
      } catch (err) {
        return Response.json({ success: false, error: (err as Error).message, hint: 'Credentials were restored from the setup code but the connection test failed. The service account may need access to this spreadsheet again.' });
      }
    }

    // ====== Logout — wipe all credentials from disk + expire the cookie ======
    if (action === 'logout') {
      writeConfigFile({
        googleServiceAccountEmail: '',
        googlePrivateKey: '',
        googleSpreadsheetId: '',
        googleClientId: '',
        googleClientSecret: '',
        calendarSecretToken: '',
        powerschoolUrl: '',
        powerschoolUsername: '',
        powerschoolPassword: '',
      });
      const clearCookie = `${CONFIG_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`;
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearCookie },
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/setup error:', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
