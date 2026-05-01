import { NextRequest } from 'next/server';
import { getTasks, addTask, updateTask, deleteTask } from '@/lib/sheets';
import type { Task } from '@/types';

export async function GET() {
  try {
    const tasks = await getTasks();
    return Response.json(tasks);
  } catch (error) {
    console.error('GET /api/tasks error:', error);
    return Response.json([], { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: Task = await request.json();
    await addTask(body);
    return Response.json({ success: true });
  } catch (error) {
    console.error('POST /api/tasks error:', error);
    return Response.json({ error: 'Failed to add task' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body: Task = await request.json();
    await updateTask(body);
    return Response.json({ success: true });
  } catch (error) {
    console.error('PUT /api/tasks error:', error);
    return Response.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
    await deleteTask(id);
    return Response.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/tasks error:', error);
    return Response.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
