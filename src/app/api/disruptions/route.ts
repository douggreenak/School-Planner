import { NextRequest } from 'next/server';
import { getDisruptions, addDisruption, updateDisruption, deleteDisruption } from '@/lib/sheets';
import type { ScheduleDisruption } from '@/types';

export async function GET() {
  try {
    const disruptions = await getDisruptions();
    return Response.json(disruptions);
  } catch (error) {
    console.error('GET /api/disruptions error:', error);
    return Response.json([], { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: ScheduleDisruption = await request.json();
    await addDisruption(body);
    return Response.json({ success: true });
  } catch (error) {
    console.error('POST /api/disruptions error:', error);
    return Response.json({ error: 'Failed to add disruption' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body: ScheduleDisruption = await request.json();
    await updateDisruption(body);
    return Response.json({ success: true });
  } catch (error) {
    console.error('PUT /api/disruptions error:', error);
    return Response.json({ error: 'Failed to update disruption' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
    await deleteDisruption(id);
    return Response.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/disruptions error:', error);
    return Response.json({ error: 'Failed to delete disruption' }, { status: 500 });
  }
}
