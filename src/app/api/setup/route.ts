import { NextRequest } from 'next/server';
import { getConfigFromRequest, writeConfigFile, isConfigured, buildConfigCookieHeader, CONFIG_COOKIE } from '@/lib/config';
import { encrypt, decrypt } from '@/lib/crypto';
import { initializeDatabase } from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';

function withCookie(data: unknown, cookieHeader: string): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookieHeader },
  });
}

function unauth() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: Request) {
  const { configured } = isConfigured();
  const cfg = getConfigFromRequest(request);
  return Response.json({
    configured,
    hasDatabase: configured,
    hasClassroomOAuth: !!cfg.googleClientId,
    hasPowerschool: !!cfg.powerschoolPassword,
    powerschoolUrl: cfg.powerschoolUrl || '',
    powerschoolUsername: cfg.powerschoolUsername || '',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // ====== Initialize database tables — requires auth ======
    if (action === 'initialize-db') {
      const userId = await getSessionUserId(request);
      if (!userId) return unauth();
      await initializeDatabase();
      return Response.json({ success: true, message: 'Database tables ready.' });
    }

    // ====== Save PowerSchool credentials — requires auth ======
    if (action === 'save-powerschool') {
      const userId = await getSessionUserId(request);
      if (!userId) return unauth();
      const { url, username, password } = body;
      if (!url || !username || !password) {
        return Response.json({ success: false, error: 'URL, username, and password are all required.' });
      }
      writeConfigFile({ powerschoolUrl: url, powerschoolUsername: username, powerschoolPassword: password });
      return withCookie({ success: true }, buildConfigCookieHeader(getConfigFromRequest(request)));
    }

    // ====== Clear saved PowerSchool credentials — requires auth ======
    if (action === 'clear-powerschool') {
      const userId = await getSessionUserId(request);
      if (!userId) return unauth();
      writeConfigFile({ powerschoolUrl: '', powerschoolUsername: '', powerschoolPassword: '' });
      return withCookie({ success: true }, buildConfigCookieHeader(getConfigFromRequest(request)));
    }

    // ====== Save Classroom OAuth credentials — requires auth ======
    if (action === 'save-classroom-oauth') {
      const userId = await getSessionUserId(request);
      if (!userId) return unauth();
      const { clientId, clientSecret } = body;
      writeConfigFile({ googleClientId: clientId, googleClientSecret: clientSecret });
      return withCookie({ success: true }, buildConfigCookieHeader(getConfigFromRequest(request)));
    }

    // ====== Generate a portable Setup Code (encrypted) — requires auth ======
    if (action === 'generate-setup-code') {
      const userId = await getSessionUserId(request);
      if (!userId) return unauth();
      const { passphrase } = body;
      if (!passphrase || passphrase.length < 4) {
        return Response.json({ success: false, error: 'Passphrase must be at least 4 characters.' });
      }
      const cfg = getConfigFromRequest(request);
      const payload = JSON.stringify({
        ...(cfg.googleClientId ? { ci: cfg.googleClientId } : {}),
        ...(cfg.googleClientSecret ? { cs: cfg.googleClientSecret } : {}),
        ...(cfg.powerschoolUrl ? { pu: cfg.powerschoolUrl } : {}),
        ...(cfg.powerschoolUsername ? { pn: cfg.powerschoolUsername } : {}),
        ...(cfg.powerschoolPassword ? { pp: cfg.powerschoolPassword } : {}),
      });
      const code = encrypt(payload, passphrase);
      return Response.json({ success: true, setupCode: `SP2-${code}` });
    }

    // ====== Restore credentials from a Setup Code — requires auth ======
    if (action === 'use-setup-code') {
      const userId = await getSessionUserId(request);
      if (!userId) return unauth();
      const { setupCode, passphrase } = body;
      if (!setupCode || !passphrase) {
        return Response.json({ success: false, error: 'Setup code and passphrase are required.' });
      }
      const raw = setupCode.startsWith('SP2-') ? setupCode.slice(4)
        : setupCode.startsWith('SP1-') ? setupCode.slice(4)
        : setupCode;

      let payload: { ci?: string; cs?: string; pu?: string; pn?: string; pp?: string };
      try {
        payload = JSON.parse(decrypt(raw, passphrase));
      } catch (err) {
        return Response.json({ success: false, error: (err as Error).message || 'Invalid setup code or wrong passphrase.' });
      }

      const configUpdate: Record<string, string> = {};
      if (payload.ci) configUpdate.googleClientId = payload.ci;
      if (payload.cs) configUpdate.googleClientSecret = payload.cs;
      if (payload.pu) configUpdate.powerschoolUrl = payload.pu;
      if (payload.pn) configUpdate.powerschoolUsername = payload.pn;
      if (payload.pp) configUpdate.powerschoolPassword = payload.pp;
      writeConfigFile(configUpdate);

      return withCookie(
        { success: true, hasClassroomOAuth: !!payload.ci, hasPowerschool: !!payload.pp },
        buildConfigCookieHeader(getConfigFromRequest(request)),
      );
    }

    // ====== Export config — requires auth ======
    if (action === 'export-config') {
      const userId = await getSessionUserId(request);
      if (!userId) return unauth();
      const cfg = getConfigFromRequest(request);
      return Response.json({ success: true, config: cfg });
    }

    // ====== Logout (legacy config reset) — requires auth ======
    if (action === 'logout') {
      const userId = await getSessionUserId(request);
      if (!userId) return unauth();
      writeConfigFile({
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
