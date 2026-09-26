import { NextResponse } from 'next/server';

// Razorpay payment gateway has been removed. This webhook handler is no longer active.
export async function POST() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
