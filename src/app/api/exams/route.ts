import { NextRequest } from 'next/server';
import { getExams, addExam, updateExam, deleteExam } from '@/lib/sheets';
import type { Exam } from '@/types';

export async function GET() {
  try {
    const exams = await getExams();
    return Response.json(exams);
  } catch (error) {
    console.error('GET /api/exams error:', error);
    return Response.json([], { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: Exam = await request.json();
    await addExam(body);
    return Response.json({ success: true });
  } catch (error) {
    console.error('POST /api/exams error:', error);
    return Response.json({ error: 'Failed to add exam' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body: Exam = await request.json();
    await updateExam(body);
    return Response.json({ success: true });
  } catch (error) {
    console.error('PUT /api/exams error:', error);
    return Response.json({ error: 'Failed to update exam' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
    await deleteExam(id);
    return Response.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/exams error:', error);
    return Response.json({ error: 'Failed to delete exam' }, { status: 500 });
  }
}
