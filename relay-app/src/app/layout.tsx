import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Relay — Referral Conversion Platform',
  description: 'Text-message referral scheduling for clinics',
  // The web app manifest (app/manifest.ts) is linked automatically.
  applicationName: 'Relay',
  appleWebApp: { capable: true, title: 'Relay', statusBarStyle: 'default' },
  icons: { apple: '/pwa/apple-touch-icon.png' },
};

// Title-bar colour of the installed app: the Relay teal accent (--relay-accent).
export const viewport: Viewport = {
  themeColor: '#0d9488',
};

// The signed-in console shell lives in app/(app)/layout.tsx; /login renders bare.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="app-root">{children}</body>
    </html>
  );
}
