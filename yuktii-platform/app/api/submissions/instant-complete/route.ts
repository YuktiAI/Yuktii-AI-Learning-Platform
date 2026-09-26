import { NextResponse } from 'next/server';

// This endpoint is no longer exposed in the UI.
// It returns 404 unconditionally so it cannot be discovered or misused.
export async function POST() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
