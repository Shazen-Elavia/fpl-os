export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { subscription } = req.body;
    if (!subscription) return res.status(400).json({ error: 'No subscription provided' });

    // Store subscription in Vercel KV or just log it
    // For now we store in a simple env-based approach
    // In production this goes to a database - for single user we use a file approach
    console.log('Push subscription registered:', JSON.stringify(subscription));

    // Store subscription endpoint in environment for the alert job to use
    // We'll use a global store approach for single user
    global.pushSubscription = subscription;

    res.json({ success: true, message: 'Subscribed to push notifications' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
