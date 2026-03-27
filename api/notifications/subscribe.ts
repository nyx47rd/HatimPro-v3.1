import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';

const publicVapidKey = process.env.VITE_VAPID_PUBLIC_KEY || 'BEryiIKVG98nuPG9_yjLcUIc9ZPP2ruWPD3LVrZAo0WAijZ4B-Q55NC_LkjNTxZg4dn96PCAeWtk0tVnX4dFxPU';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '4z-4kM5PDCLl8aJKuTp4vGTNnlragY08gFWH2RgM79I';

webpush.setVapidDetails(
  'mailto:yasar.123.sevda@gmail.com',
  publicVapidKey,
  privateVapidKey
);

// Note: In a real serverless environment, you'd need a database to persist subscriptions.
// Since we don't have a DB set up for this yet, we'll use a temporary mock or 
// explain to the user that they need a DB (like Firestore) to store these.
// For now, let's try to use Firestore if it's already set up.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const subscription = req.body;
  
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }

  console.log('Subscription received for endpoint:', subscription.endpoint);

  res.status(201).json({ success: true, message: 'Subscription received' });
}
