import webpush from 'web-push';

const TEAM_ID = 3008614;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'KV store not configured' });
  }

  // Get push subscription from Upstash
  let pushSubscription = null;
  try {
    const kvRes = await fetch(`${KV_URL}/get/push_subscription`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const kvData = await kvRes.json();
    if (kvData.result) {
      pushSubscription = JSON.parse(kvData.result);
    }
  } catch(e) {
    return res.status(500).json({ error: 'Could not read subscription from KV: ' + e.message });
  }

  if (!pushSubscription) {
    return res.status(200).json({ message: 'No push subscription registered yet. Open the app and enable alerts first.' });
  }

  webpush.setVapidDetails('mailto:shazen00@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);

  try {
    // Fetch FPL bootstrap
    const bootstrapRes = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const bootstrap = await bootstrapRes.json();

    const currentGW = bootstrap.events.find(e => e.is_current) || bootstrap.events.find(e => e.is_next);
    const gwId = currentGW ? currentGW.id : 1;

    // Get owned player IDs
    let ownedIds = [];
    let ownedStatuses = {};
    try {
      const picksRes = await fetch(`https://fantasy.premierleague.com/api/entry/${TEAM_ID}/event/${gwId}/picks/`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const picks = await picksRes.json();
      ownedIds = picks.picks.map(p => p.element);
    } catch(e) {
      console.log('Could not fetch picks:', e.message);
    }

    // Get previously stored player statuses to detect CHANGES
    let prevStatuses = {};
    try {
      const prevRes = await fetch(`${KV_URL}/get/player_statuses`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const prevData = await prevRes.json();
      if (prevData.result) prevStatuses = JSON.parse(prevData.result);
    } catch(e) {}

    const pById = {};
    const currentStatuses = {};
    bootstrap.elements.forEach(e => {
      pById[e.id] = e;
      currentStatuses[e.id] = { status: e.status, cost: e.now_cost, form: e.form };
    });

    const alerts = [];

    // Alert 1: Status changes for owned players
    ownedIds.forEach(id => {
      const p = pById[id];
      if (!p) return;
      const prev = prevStatuses[id];

      // New injury/doubt/suspension detected
      if (prev && prev.status === 'a' && p.status === 'i') {
        alerts.push({ priority: 1, msg: `🚨 INJURY: ${p.web_name} just picked up an injury — sell now before price drops` });
      } else if (prev && prev.status === 'a' && p.status === 'd') {
        alerts.push({ priority: 2, msg: `⚠️ DOUBT: ${p.web_name} is now doubtful — monitor before deadline` });
      } else if (prev && prev.status === 'a' && p.status === 's') {
        alerts.push({ priority: 1, msg: `🚨 SUSPENDED: ${p.web_name} is suspended — transfer out immediately` });
      }
      // Already injured reminder
      else if (p.status === 'i' && !prev) {
        alerts.push({ priority: 2, msg: `🚨 INJURED: ${p.web_name} in your squad is injured` });
      }
    });

    // Alert 2: Price rises for players NOT in your squad with high form
    bootstrap.elements
      .filter(e => e.cost_change_event > 0 && !ownedIds.includes(e.id) && parseFloat(e.form) > 6)
      .sort((a,b) => parseFloat(b.form) - parseFloat(a.form))
      .slice(0, 2)
      .forEach(p => {
        alerts.push({ priority: 2, msg: `📈 PRICE RISE: ${p.web_name} up to £${(p.now_cost/10).toFixed(1)}m — form ${p.form}, ${p.selected_by_percent}% owned` });
      });

    // Alert 3: Price drops for players you OWN
    ownedIds.forEach(id => {
      const p = pById[id];
      if (!p) return;
      if (p.cost_change_event < 0) {
        alerts.push({ priority: 1, msg: `📉 PRICE DROP: ${p.web_name} dropped to £${(p.now_cost/10).toFixed(1)}m — consider selling` });
      }
    });

    // Alert 4: Hot form player not owned (transfer target)
    const hotTargets = bootstrap.elements
      .filter(e => e.status === 'a' && !ownedIds.includes(e.id) && parseFloat(e.form) > 9)
      .sort((a,b) => parseFloat(b.form) - parseFloat(a.form))
      .slice(0, 1);

    hotTargets.forEach(p => {
      alerts.push({ priority: 3, msg: `🔥 HOT: ${p.web_name} on fire (form ${p.form}) — £${(p.now_cost/10).toFixed(1)}m, ${p.selected_by_percent}% owned. Buy before price rises.` });
    });

    // Alert 5: Deadline warning
    const nextGW = bootstrap.events.find(e => new Date(e.deadline_time) > new Date());
    if (nextGW) {
      const hoursLeft = (new Date(nextGW.deadline_time) - new Date()) / 3600000;
      if (hoursLeft <= 48 && hoursLeft > 47) {
        alerts.push({ priority: 2, msg: `⏰ 48H WARNING: GW${nextGW.id} deadline in 48 hours — finalise your team` });
      } else if (hoursLeft <= 24 && hoursLeft > 23) {
        alerts.push({ priority: 1, msg: `🚨 24H DEADLINE: GW${nextGW.id} deadline tomorrow — make your moves NOW` });
      } else if (hoursLeft <= 6 && hoursLeft > 0) {
        alerts.push({ priority: 1, msg: `🚨 FINAL HOURS: GW${nextGW.id} deadline in ${Math.round(hoursLeft)}h — last chance` });
      }
    }

    // Save current statuses for next comparison
    await fetch(`${KV_URL}/set/player_statuses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(currentStatuses) })
    });

    if (alerts.length === 0) {
      return res.json({ message: 'All clear — no alerts', checked: new Date().toISOString() });
    }

    // Sort by priority and send top alert
    alerts.sort((a,b) => a.priority - b.priority);
    const topAlert = alerts[0];
    const allAlerts = alerts.map(a => a.msg);

    const payload = JSON.stringify({
      title: 'FPL OS',
      body: topAlert.msg,
      alerts: allAlerts,
      url: 'https://fpl-os.vercel.app'
    });

    await webpush.sendNotification(pushSubscription, payload);

    res.json({
      success: true,
      alertsSent: alerts.length,
      alerts: allAlerts,
      timestamp: new Date().toISOString()
    });

  } catch(e) {
    console.error('Alert error:', e);
    res.status(500).json({ error: e.message });
  }
}
