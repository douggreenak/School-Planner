import { NextRequest } from 'next/server';
import { getConfigFromRequest } from '@/lib/config';
import { getAuthUrl } from '@/lib/classroom';
import { getSessionUserId } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const cfg = getConfigFromRequest(request);
    if (!cfg.googleClientId || !cfg.googleClientSecret) {
      return Response.json({
        error: 'Google Classroom is not configured. Go to Settings and add your OAuth Client ID and Client Secret under the Google Classroom section.',
        needsSetup: true,
      }, { status: 400 });
    }

    // Embed userId in OAuth state so the callback can scope DB writes
    const state = Buffer.from(userId).toString('base64');
    const authUrl = getAuthUrl(state);
    return Response.json({ authUrl });
  } catch (error) {
    console.error('GET /api/classroom error:', error);
    return Response.json({ error: `Failed to generate auth URL: ${(error as Error).message}` }, { status: 500 });
  }
}
