import webpush from 'web-push';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return res.status(500).json({ error: 'VAPID keys missing' });
  if (!KV_URL || !KV_TOKEN) return res.status(500).json({ error: 'KV store missing' });

  // Get subscription from Upstash
  let pushSubscription = null;
  try {
    const kvRes = await fetch(`${KV_URL}/get/push_subscription`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const kvData = await kvRes.json();
    if (kvData.result) pushSubscription = JSON.parse(kvData.result);
  } catch(e) {
    return res.status(500).json({ error: 'KV read failed: ' + e.message });
  }

  if (!pushSubscription) {
    return res.status(400).json({ error: 'No subscription found. Open the app and enable alerts first.' });
  }

  webpush.setVapidDetails('mailto:shazen00@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);

  const payload = JSON.stringify({
    title: 'FPL OS · Test Alert 🔔',
    body: '🚨 TRANSFER ALERT: Haaland just bagged a hat-trick — buy before 2am price rise. War chest: £3.0m',
    url: 'https://fpl-os.vercel.app'
  });

  try {
    await webpush.sendNotification(pushSubscription, payload);
    res.json({ success: true, message: 'Test notification sent — check your phone' });
  } catch(e) {
    res.status(500).json({ error: 'Push failed: ' + e.message });
  }
}
