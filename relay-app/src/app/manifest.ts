import type { MetadataRoute } from 'next';

// Web app manifest: makes Relay installable as a browser app ("Install Relay" in
// Chrome/Edge, "Add to Dock" in Safari). Served at /manifest.webmanifest, which
// src/proxy.ts lets through without a login.
//
// Deliberately NO service worker: nothing (least of all patient data) is cached
// for offline use. The installed app is just a window onto the live, logged-in site.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Relay — Referral Conversion',
    short_name: 'Relay',
    description: 'Staff console for turning specialist referrals into booked appointments.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f4f7f8', // --relay-bg
    theme_color: '#0d9488', // --relay-accent (teal)
    icons: [
      { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
