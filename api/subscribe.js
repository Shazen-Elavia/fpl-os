export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'KV store not configured' });
  }

  try {
    const { subscription } = req.body;
    if (!subscription) return res.status(400).json({ error: 'No subscription provided' });

    // Store subscription in Upstash Redis
    const response = await fetch(`${KV_URL}/set/push_subscription`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: JSON.stringify(subscription) })
    });

    if (!response.ok) {
      throw new Error('Failed to store subscription in KV');
    }

    res.json({ success: true, message: 'Push subscription saved' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
