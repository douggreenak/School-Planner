import { NextRequest } from 'next/server';
import { getSettings, setSetting, initializeSpreadsheet } from '@/lib/sheets';
import { isConfigured } from '@/lib/config';

export async function GET() {
  // Check if sheets are configured at all
  const { configured } = isConfigured();
  if (!configured) {
    return Response.json({});
  }

  try {
    const settings = await getSettings();
    return Response.json(settings);
  } catch (error) {
    console.error('GET /api/settings error:', error);
    return Response.json({}, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { key, value } = await request.json();
    if (!key) return Response.json({ error: 'Missing key' }, { status: 400 });
    await setSetting(key, value);
    return Response.json({ success: true });
  } catch (error) {
    console.error('POST /api/settings error:', error);
    return Response.json({ error: 'Failed to save setting. Is Google Sheets connected?' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { action } = await request.json();
    if (action === 'initialize') {
      await initializeSpreadsheet();
      return Response.json({ success: true });
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('PUT /api/settings error:', error);
    return Response.json({ error: `Failed: ${(error as Error).message}` }, { status: 500 });
  }
}
