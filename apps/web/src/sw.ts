/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// App shell, injected at build time by vite-plugin-pwa.
precacheAndRoute(self.__WB_MANIFEST);

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

// Web Push from the notifier Lambda (VAPID). The same message also lands in the in-app inbox,
// so students who declined push still see it.
self.addEventListener('push', (event) => {
  const data = (event.data?.json() ?? { title: 'Racket Club', body: '' }) as PushPayload;
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: { url: data.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).pathname === url);
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
