import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { Providers } from './providers';
import { ActiveCallBanner } from '@/components/shared/ActiveCallBanner';

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
  description: 'Voice AI referral conversion for specialist practices',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="app-root">
        <Providers>
          <Sidebar />
          <div className="main">
            <TopBar />
            <ActiveCallBanner />
            <div className="pg">
              {children}
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
