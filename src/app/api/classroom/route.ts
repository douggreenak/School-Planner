import { getConfigFromRequest } from '@/lib/config';
import { getAuthUrl } from '@/lib/classroom';

export async function GET(request: Request) {
  try {
    const cfg = getConfigFromRequest(request);
    if (!cfg.googleClientId || !cfg.googleClientSecret) {
      return Response.json({
        error: 'Google Classroom is not configured. Go to Settings and add your OAuth Client ID and Client Secret under the Google Classroom section.',
        needsSetup: true,
      }, { status: 400 });
    }

    const authUrl = getAuthUrl();
    return Response.json({ authUrl });
  } catch (error) {
    console.error('GET /api/classroom error:', error);
    return Response.json({ error: `Failed to generate auth URL: ${(error as Error).message}` }, { status: 500 });
  }
}
