// api/create-checkout.js
// Vercel serverless function — creates a Stripe checkout session

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://gooddaygolf.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const { userId, email } = req.body;

    if (!userId || !email) {
      res.status(400).json({ error: 'Missing userId or email' });
      return;
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: email,
      client_reference_id: userId,
      success_url: 'https://gooddaygolf.app?payment=success',
      cancel_url: 'https://gooddaygolf.app?payment=cancelled',
      metadata: { userId, email },
      allow_promotion_codes: true,
    });

    res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
};
