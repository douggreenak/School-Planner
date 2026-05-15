import { NextRequest } from 'next/server';
import { getSettings, setSetting, initializeDatabase } from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';

function unauth() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: Request) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const settings = await getSettings(userId);
    return Response.json(settings);
  } catch (error) {
    console.error('GET /api/settings error:', error);
    return Response.json({}, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const { key, value } = await request.json();
    if (!key) return Response.json({ error: 'Missing key' }, { status: 400 });
    await setSetting(key, value, userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('POST /api/settings error:', error);
    return Response.json({ error: 'Failed to save setting.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const { action } = await request.json();
    if (action === 'initialize') {
      await initializeDatabase();
      return Response.json({ success: true });
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('PUT /api/settings error:', error);
    return Response.json({ error: `Failed: ${(error as Error).message}` }, { status: 500 });
  }
}
