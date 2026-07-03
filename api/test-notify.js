import { Redis } from '@upstash/redis';
import webpush from 'web-push';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return res.status(500).json({ error: 'VAPID keys missing' });

  try {
    const redis = Redis.fromEnv();
    const raw = await redis.get('push_subscription');
    if (!raw) return res.status(400).json({ error: 'No subscription found. Open the app and enable alerts first.' });

    const sub = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!sub.endpoint) return res.status(400).json({ error: 'Subscription has no endpoint — re-enable alerts in the app.' });

    webpush.setVapidDetails('mailto:shazen00@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);

    await webpush.sendNotification(sub, JSON.stringify({
      title: 'FPL OS · Test Alert 🔔',
      body: '🚨 TRANSFER ALERT: Haaland just bagged a hat-trick — buy before 2am price rise. War chest: £3.0m',
      url: 'https://fpl-os.vercel.app'
    }));

    res.json({ success: true, message: 'Test notification sent — check your phone' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
