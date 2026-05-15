import { NextRequest } from 'next/server';
import { getTasks, addTask, updateTask, deleteTask, deleteTasksBatch } from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';
import type { Task } from '@/types';

function unauth() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const tasks = await getTasks(userId);
    return Response.json(tasks);
  } catch (error) {
    console.error('GET /api/tasks error:', error);
    return Response.json([], { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const body: Task = await request.json();
    await addTask(body, userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('POST /api/tasks error:', error);
    return Response.json({ error: 'Failed to add task' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const body: Task = await request.json();
    await updateTask(body, userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('PUT /api/tasks error:', error);
    return Response.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids');
    if (idsParam) {
      const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) return Response.json({ error: 'Empty ids' }, { status: 400 });
      const deleted = await deleteTasksBatch(ids, userId);
      return Response.json({ success: true, deleted });
    }
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
    await deleteTask(id, userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/tasks error:', error);
    return Response.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
