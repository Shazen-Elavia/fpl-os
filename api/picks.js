export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { id, gw } = req.query;
  if (!id || !gw) return res.status(400).json({ error: 'Missing id or gw' });
  try {
    const r = await fetch(`https://fantasy.premierleague.com/api/entry/${id}/event/${gw}/picks/`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=60');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
