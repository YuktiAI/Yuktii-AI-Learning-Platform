import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { prisma } from '@/lib/prisma';
import { logError } from '@/lib/error-handler';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('x-razorpay-signature');
  const secret = process.env.RAZORPAY_KEY_SECRET;

  if (!secret) {
    return NextResponse.json({ error: 'Razorpay not configured' }, { status: 501 });
  }

  // Verify webhook signature
  const expectedSig = createHmac('sha256', secret).update(body).digest('hex');
  if (signature !== expectedSig) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    const event = JSON.parse(body);

    if (event.event === 'payment.captured') {
      const { order_id, id: paymentId } = event.payload.payment.entity;

      await prisma.enrollment.updateMany({
        where: { razorpayOrderId: order_id },
        data: {
          paymentStatus: 'PAID',
          status: 'IN_PROGRESS',
          razorpayPaymentId: paymentId,
        },
      });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    await logError({
      service: 'razorpay-webhook',
      error: err,
      context: { rawEvent: body.slice(0, 500) },
    });
    // Return 200 to Razorpay so it doesn't retry — we've logged the failure
    return NextResponse.json({ received: true });
  }
}
