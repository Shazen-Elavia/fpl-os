self.addEventListener('push', function(event) {
  if (!event.data) return;

  const data = event.data.json();
  const title = data.title || 'FPL OS';
  const options = {
    body: data.body || 'New FPL alert',
    icon: data.icon || '/icon.png',
    badge: data.badge || '/icon.png',
    data: { url: data.url || 'https://fpl-os.vercel.app' },
    actions: [
      { action: 'open', title: 'Open FPL OS' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    requireInteraction: true,
    vibrate: [200, 100, 200]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data.url || 'https://fpl-os.vercel.app';
  event.waitUntil(clients.openWindow(url));
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
