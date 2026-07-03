import { Redis } from '@upstash/redis';
import webpush from 'web-push';

const TEAM_ID = 3008614;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return res.status(500).json({ error: 'VAPID keys missing' });

  try {
    const redis = Redis.fromEnv();
    const raw = await redis.get('push_subscription');
    if (!raw) return res.status(200).json({ message: 'No push subscription registered yet.' });

    const pushSubscription = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!pushSubscription.endpoint) return res.status(200).json({ message: 'Subscription has no endpoint — re-enable alerts.' });

    webpush.setVapidDetails('mailto:shazen00@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);

    const bootstrapRes = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const bootstrap = await bootstrapRes.json();
    const currentGW = bootstrap.events.find(e => e.is_current) || bootstrap.events.find(e => e.is_next);
    const gwId = currentGW ? currentGW.id : 38;

    let ownedIds = [];
    try {
      const picksRes = await fetch(`https://fantasy.premierleague.com/api/entry/${TEAM_ID}/event/${gwId}/picks/`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const picks = await picksRes.json();
      ownedIds = picks.picks.map(p => p.element);
    } catch(e) {}

    const pById = {};
    bootstrap.elements.forEach(e => pById[e.id] = e);
    const alerts = [];

    // Injury/suspension alerts for owned players
    ownedIds.forEach(id => {
      const p = pById[id]; if (!p) return;
      if (p.status === 'i') alerts.push({ priority:1, msg:`🚨 INJURY: ${p.web_name} is injured — sell before price drops` });
      if (p.status === 's') alerts.push({ priority:1, msg:`🚨 SUSPENDED: ${p.web_name} — transfer out immediately` });
      if (p.status === 'd') alerts.push({ priority:2, msg:`⚠️ DOUBT: ${p.web_name} is doubtful — monitor` });
      if (p.cost_change_event < 0) alerts.push({ priority:1, msg:`📉 PRICE DROP: ${p.web_name} fell to £${(p.now_cost/10).toFixed(1)}m` });
    });

    // Price risers not owned
    bootstrap.elements
      .filter(e => e.cost_change_event > 0 && !ownedIds.includes(e.id) && parseFloat(e.form) > 6)
      .sort((a,b) => parseFloat(b.form) - parseFloat(a.form)).slice(0,2)
      .forEach(p => alerts.push({ priority:2, msg:`📈 PRICE RISE: ${p.web_name} up to £${(p.now_cost/10).toFixed(1)}m — form ${p.form}` }));

    // Deadline warning
    const nextGW = bootstrap.events.find(e => new Date(e.deadline_time) > new Date());
    if (nextGW) {
      const h = (new Date(nextGW.deadline_time) - new Date()) / 3600000;
      if (h <= 48 && h > 47) alerts.push({ priority:2, msg:`⏰ 48H WARNING: GW${nextGW.id} deadline in 48 hours` });
      else if (h <= 24 && h > 23) alerts.push({ priority:1, msg:`🚨 24H DEADLINE: GW${nextGW.id} deadline tomorrow — act now` });
      else if (h <= 6 && h > 0) alerts.push({ priority:1, msg:`🚨 FINAL ${Math.round(h)}H: GW${nextGW.id} deadline — last chance` });
    }

    if (alerts.length === 0) return res.json({ message: 'All clear — no alerts', checked: new Date().toISOString() });

    alerts.sort((a,b) => a.priority - b.priority);
    await webpush.sendNotification(pushSubscription, JSON.stringify({
      title: 'FPL OS', body: alerts[0].msg, alerts: alerts.map(a=>a.msg), url: 'https://fpl-os.vercel.app'
    }));

    res.json({ success:true, alertsSent:alerts.length, alerts:alerts.map(a=>a.msg), timestamp:new Date().toISOString() });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
