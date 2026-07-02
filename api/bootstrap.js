export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=300');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
