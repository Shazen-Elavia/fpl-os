import webpush from 'web-push';

const TEAM_ID = 3008614;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
  const PUSH_SUBSCRIPTION = process.env.PUSH_SUBSCRIPTION;

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }

  if (!PUSH_SUBSCRIPTION) {
    return res.status(200).json({ message: 'No push subscription registered yet' });
  }

  webpush.setVapidDetails('mailto:shazen00@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);

  try {
    // Fetch bootstrap for player status
    const bootstrapRes = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const bootstrap = await bootstrapRes.json();

    // Fetch team picks to know which players we own
    const currentGW = bootstrap.events.find(e => e.is_current) || bootstrap.events.find(e => e.is_next);
    const gwId = currentGW ? currentGW.id : 1;

    let ownedIds = [];
    try {
      const picksRes = await fetch(`https://fantasy.premierleague.com/api/entry/${TEAM_ID}/event/${gwId}/picks/`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const picks = await picksRes.json();
      ownedIds = picks.picks.map(p => p.element);
    } catch(e) {
      console.log('Could not fetch picks:', e.message);
    }

    const pById = {};
    bootstrap.elements.forEach(e => pById[e.id] = e);

    const alerts = [];

    // Check 1: Injured/suspended players in your squad
    ownedIds.forEach(id => {
      const p = pById[id];
      if (!p) return;
      if (p.status === 'i') alerts.push(`🚨 INJURY: ${p.web_name} is injured — consider selling now`);
      if (p.status === 's') alerts.push(`🚨 SUSPENDED: ${p.web_name} is suspended this GW`);
      if (p.status === 'd') alerts.push(`⚠️ DOUBT: ${p.web_name} is doubtful — monitor`);
    });

    // Check 2: Price rise candidates (cost_change_event > 0 means price rose today)
    const priceRisers = bootstrap.elements
      .filter(e => e.cost_change_event > 0 && !ownedIds.includes(e.id) && parseFloat(e.form) > 6)
      .sort((a,b) => parseFloat(b.form) - parseFloat(a.form))
      .slice(0, 3);

    priceRisers.forEach(p => {
      alerts.push(`📈 PRICE RISE: ${p.web_name} rose to £${(p.now_cost/10).toFixed(1)}m — form ${p.form}`);
    });

    // Check 3: High form players not in your squad (transfer targets)
    const hotPlayers = bootstrap.elements
      .filter(e => e.status === 'a' && !ownedIds.includes(e.id) && parseFloat(e.form) > 8)
      .sort((a,b) => parseFloat(b.form) - parseFloat(a.form))
      .slice(0, 2);

    hotPlayers.forEach(p => {
      alerts.push(`🔥 IN FORM: ${p.web_name} (${(p.now_cost/10).toFixed(1)}m) — form ${p.form}, ${p.selected_by_percent}% owned`);
    });

    // Check 4: Deadline warning
    const nextGW = bootstrap.events.find(e => new Date(e.deadline_time) > new Date());
    if (nextGW) {
      const hoursToDeadline = (new Date(nextGW.deadline_time) - new Date()) / 3600000;
      if (hoursToDeadline <= 48 && hoursToDeadline > 0) {
        alerts.push(`⏰ DEADLINE: GW${nextGW.id} deadline in ${Math.round(hoursToDeadline)}h — make your moves`);
      }
    }

    if (alerts.length === 0) {
      return res.json({ message: 'No alerts to send', checked: new Date().toISOString() });
    }

    // Send push notification
    const subscription = JSON.parse(PUSH_SUBSCRIPTION);
    const payload = JSON.stringify({
      title: 'FPL OS Alert',
      body: alerts[0], // Most important alert
      alerts: alerts,
      icon: '/icon.png',
      badge: '/icon.png',
      url: 'https://fpl-os.vercel.app'
    });

    await webpush.sendNotification(subscription, payload);

    res.json({
      success: true,
      alertsSent: alerts.length,
      alerts,
      timestamp: new Date().toISOString()
    });

  } catch(e) {
    console.error('Alert error:', e);
    res.status(500).json({ error: e.message });
  }
}
