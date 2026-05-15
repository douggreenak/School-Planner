import { NextRequest } from 'next/server';
import { getHomework, addHomework, updateHomework, deleteHomework } from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';
import type { Homework } from '@/types';

function unauth() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const homework = await getHomework(userId);
    return Response.json(homework);
  } catch (error) {
    console.error('GET /api/homework error:', error);
    return Response.json([], { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const body: Homework = await request.json();
    await addHomework(body, userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('POST /api/homework error:', error);
    return Response.json({ error: 'Failed to add homework' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const body: Homework = await request.json();
    await updateHomework(body, userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('PUT /api/homework error:', error);
    return Response.json({ error: 'Failed to update homework' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
    await deleteHomework(id, userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/homework error:', error);
    return Response.json({ error: 'Failed to delete homework' }, { status: 500 });
  }
}
