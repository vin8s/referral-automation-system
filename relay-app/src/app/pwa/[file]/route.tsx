// App icons for the installable browser app, drawn from the sidebar's brand mark
// (.sb-mark: white "R" on the teal accent). Rendered once at build time.
// Paths end in .png so src/proxy.ts serves them without a login.

import { ImageResponse } from 'next/og';

const ACCENT = '#0d9488'; // --relay-accent

const ICONS: Record<string, { size: number; fullBleed: boolean }> = {
  'icon-192.png': { size: 192, fullBleed: false },
  'icon-512.png': { size: 512, fullBleed: false },
  // Maskable/Apple icons: the OS applies its own rounding, so fill the square.
  'icon-maskable-512.png': { size: 512, fullBleed: true },
  'apple-touch-icon.png': { size: 180, fullBleed: true },
};

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(ICONS).map(file => ({ file }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const icon = ICONS[file];
  if (!icon) return new Response('Not found', { status: 404 });
  const { size, fullBleed } = icon;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: ACCENT,
          // Same 8px-on-30px corner ratio as the sidebar mark.
          borderRadius: fullBleed ? 0 : Math.round(size * (8 / 30)),
          color: '#ffffff',
          fontSize: Math.round(size * (fullBleed ? 0.42 : 0.5)),
          fontWeight: 700,
          letterSpacing: '-0.02em',
        }}
      >
        R
      </div>
    ),
    { width: size, height: size },
  );
}
