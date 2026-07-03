// v3
import { Redis } from '@upstash/redis';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const redis = Redis.fromEnv();
    const raw = await redis.get('push_subscription');

    if (!raw) return res.json({ stored: null, message: 'Nothing in Upstash' });

    const sub = typeof raw === 'string' ? JSON.parse(raw) : raw;
    res.json({
      hasEndpoint: !!sub.endpoint,
      endpointPrefix: sub.endpoint ? sub.endpoint.substring(0, 50) + '...' : null,
      hasKeys: !!sub.keys,
      keyFields: sub.keys ? Object.keys(sub.keys) : [],
      rawType: typeof raw
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
