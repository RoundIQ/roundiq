// api/stripe-webhook.js
// Vercel serverless function — handles Stripe webhook events

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Supabase admin client (service role — bypasses RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Required: raw body for Stripe signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper to read raw body from request stream
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const sig = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    res.status(400).json({ error: `Webhook error: ${err.message}` });
    return;
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const userId = session.client_reference_id;
    const stripeCustomerId = session.customer;
    const stripePaymentId = session.payment_intent;

    if (!userId) {
      console.error('No userId found in session client_reference_id');
      res.status(400).json({ error: 'Missing userId' });
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        is_premium: true,
        purchase_date: new Date().toISOString(),
        stripe_customer_id: stripeCustomerId,
        stripe_payment_id: stripePaymentId,
      })
      .eq('id', userId);

    if (error) {
      console.error('Supabase update error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
      return;
    }

    console.log(`✅ Premium unlocked for user ${userId}`);
  }

  // Always return 200 to acknowledge receipt
  res.status(200).json({ received: true });
};
