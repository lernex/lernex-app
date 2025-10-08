import { NextResponse } from 'next/server';

import { getStripeClient } from '@/lib/stripe';

type PaidPlan = 'premium' | 'pro';

const priceIdByPlan: Record<PaidPlan, string | undefined> = {
  premium: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID,
  pro: process.env.STRIPE_PRO_MONTHLY_PRICE_ID
};

function isPaidPlan(plan: string): plan is PaidPlan {
  return plan === 'premium' || plan === 'pro';
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const plan = typeof data?.plan === 'string' ? data.plan.trim().toLowerCase() : '';

    if (!isPaidPlan(plan)) {
      return NextResponse.json({ error: 'Unsupported plan selected.' }, { status: 400 });
    }

    const priceId = priceIdByPlan[plan];

    if (!priceId) {
      return NextResponse.json(
        { error: 'Pricing configuration is incomplete. Please contact support.' },
        { status: 500 }
      );
    }

    const stripe = getStripeClient();
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : 'http://localhost:3000');

    const cancelUrl =
      typeof data?.cancelUrl === 'string' && data.cancelUrl.length > 0
        ? data.cancelUrl
        : `${baseUrl}/pricing?status=cancelled`;

    const successUrl =
      typeof data?.successUrl === 'string' && data.successUrl.length > 0
        ? data.successUrl
        : `${baseUrl}/pricing?status=success`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      billing_address_collection: 'auto',
      allow_promotion_codes: true,
      metadata: { plan },
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: successUrl,
      cancel_url: cancelUrl
    });

    return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    console.error('Failed to create Stripe checkout session', error);
    return NextResponse.json(
      { error: 'Unable to start checkout right now. Please try again shortly.' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
