import { NextRequest } from 'next/server';
import { getClasses, addClass, updateClass, deleteClass } from '@/lib/sheets';
import type { SchoolClass } from '@/types';

export async function GET() {
  try {
    const classes = await getClasses();
    return Response.json(classes);
  } catch (error) {
    console.error('GET /api/classes error:', error);
    return Response.json([], { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: SchoolClass = await request.json();
    await addClass(body);
    return Response.json({ success: true });
  } catch (error) {
    console.error('POST /api/classes error:', error);
    return Response.json({ error: 'Failed to add class' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body: SchoolClass = await request.json();
    await updateClass(body);
    return Response.json({ success: true });
  } catch (error) {
    console.error('PUT /api/classes error:', error);
    return Response.json({ error: 'Failed to update class' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
    await deleteClass(id);
    return Response.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/classes error:', error);
    return Response.json({ error: 'Failed to delete class' }, { status: 500 });
  }
}
