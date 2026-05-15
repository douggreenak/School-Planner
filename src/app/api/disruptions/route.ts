import { NextRequest } from 'next/server';
import { getDisruptions, addDisruption, updateDisruption, deleteDisruption } from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';
import type { ScheduleDisruption } from '@/types';

function unauth() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const disruptions = await getDisruptions(userId);
    return Response.json(disruptions);
  } catch (error) {
    console.error('GET /api/disruptions error:', error);
    return Response.json([], { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const body: ScheduleDisruption = await request.json();
    await addDisruption(body, userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('POST /api/disruptions error:', error);
    return Response.json({ error: 'Failed to add disruption' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const body: ScheduleDisruption = await request.json();
    await updateDisruption(body, userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('PUT /api/disruptions error:', error);
    return Response.json({ error: 'Failed to update disruption' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
    await deleteDisruption(id, userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/disruptions error:', error);
    return Response.json({ error: 'Failed to delete disruption' }, { status: 500 });
  }
}
