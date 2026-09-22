import { NextRequest, NextResponse } from 'next/server';
import { readOpensreVersion } from '@/lib/opensreVersion';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('opensre_session_token')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return NextResponse.json(readOpensreVersion());
}
