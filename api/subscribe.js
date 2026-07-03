import { Redis } from '@upstash/redis';
import webpush from 'web-push';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const redis = Redis.fromEnv();
    const { subscription, clear } = req.body;

    if (clear === true) {
      await redis.del('push_subscription');
      return res.json({ success: true, message: 'Subscription cleared' });
    }

    if (!subscription) return res.status(400).json({ error: 'No subscription provided' });
    if (!subscription.endpoint) return res.status(400).json({ error: 'Subscription has no endpoint' });

    await redis.set('push_subscription', JSON.stringify(subscription));
    res.json({ success: true, message: 'Push subscription saved', endpoint: subscription.endpoint.substring(0, 40) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
