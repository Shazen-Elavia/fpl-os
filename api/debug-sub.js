// v2
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  try {
    const kvRes = await fetch(`${KV_URL}/get/push_subscription`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const kvData = await kvRes.json();

    if (!kvData.result) return res.json({ stored: null, message: 'Nothing in Upstash' });

    // Parse and show structure without exposing sensitive keys
    // Upstash wraps the value — unwrap it
    let raw = kvData.result;
    if (typeof raw === 'object' && raw.value) raw = raw.value;
    if (typeof raw === 'string') raw = JSON.parse(raw);
    const sub = raw;
    res.json({
      hasEndpoint: !!sub.endpoint,
      endpointPrefix: sub.endpoint ? sub.endpoint.substring(0, 40) + '...' : null,
      hasKeys: !!sub.keys,
      keyFields: sub.keys ? Object.keys(sub.keys) : [],
      rawType: typeof sub,
      isDoubleStringified: typeof kvData.result === 'string' && kvData.result.startsWith('"')
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
