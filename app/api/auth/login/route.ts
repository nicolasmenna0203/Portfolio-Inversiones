import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { user, pass } = await req.json();

  const validUser = process.env.BASIC_AUTH_USER;
  const validPass = process.env.BASIC_AUTH_PASS;
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (user === validUser && pass === validPass) {
    const res = NextResponse.json({ ok: true });
    res.cookies.set('session', secret, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
      secure: process.env.NODE_ENV === 'production',
    });
    return res;
  }

  return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 });
}
