import { NextRequest } from 'next/server';
import { v4 as uuid } from 'uuid';
import {
  createUser,
  getUserByUsername,
  getUserById,
  initializeDatabase,
} from '@/lib/db';
import {
  hashPassword,
  verifyPassword,
  createSession,
  getSessionUserId,
  deleteSession,
  clearSessionCookie,
} from '@/lib/auth';

let dbReady = false;
async function ensureDb() {
  if (!dbReady) {
    await initializeDatabase();
    dbReady = true;
  }
}

export async function GET(request: Request) {
  try {
    await ensureDb();
    const userId = await getSessionUserId(request);
    if (!userId) return Response.json({ user: null });
    const user = await getUserById(userId);
    return Response.json({ user });
  } catch (error) {
    console.error('GET /api/auth error:', error);
    return Response.json({ user: null });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDb();
    const body = await request.json();
    const { action } = body;

    if (action === 'register') {
      const { username, password } = body;
      if (!username || !password) {
        return Response.json({ error: 'Username and password are required.' }, { status: 400 });
      }
      if (username.trim().length < 2) {
        return Response.json({ error: 'Username must be at least 2 characters.' }, { status: 400 });
      }
      if (password.length < 4) {
        return Response.json({ error: 'Password must be at least 4 characters.' }, { status: 400 });
      }
      const existing = await getUserByUsername(username.trim());
      if (existing) {
        return Response.json({ error: 'That username is already taken.' }, { status: 409 });
      }
      const id = uuid();
      const passwordHash = await hashPassword(password);
      await createUser(id, username.trim(), passwordHash);
      const { cookie } = await createSession(id);
      return new Response(
        JSON.stringify({ success: true, user: { id, username: username.trim().toLowerCase() } }),
        { headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie } },
      );
    }

    if (action === 'login') {
      const { username, password } = body;
      if (!username || !password) {
        return Response.json({ error: 'Username and password are required.' }, { status: 400 });
      }
      const user = await getUserByUsername(username.trim());
      if (!user) {
        return Response.json({ error: 'Invalid username or password.' }, { status: 401 });
      }
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return Response.json({ error: 'Invalid username or password.' }, { status: 401 });
      }
      const { cookie } = await createSession(user.id);
      return new Response(
        JSON.stringify({ success: true, user: { id: user.id, username: user.username } }),
        { headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie } },
      );
    }

    if (action === 'logout') {
      await deleteSession(request);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie() },
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/auth error:', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
