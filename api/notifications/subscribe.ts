import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const subscription = req.body;
  
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }

  console.log('Subscription received for endpoint:', subscription.endpoint);

  res.status(201).json({ success: true, message: 'Subscription received (ntfy.sh is used for actual notifications)' });
}
