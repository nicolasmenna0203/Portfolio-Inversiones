import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Portfolio · Dashboard',
  description: 'Dashboard personal de inversiones',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Portfolio',
  },
};

// Sin viewport la página se renderiza a ancho de escritorio y el navegador la
// escala: todo queda diminuto en el celular. `viewportFit: cover` + los safe-area
// insets del CSS permiten usar la pantalla completa en iPhone con notch.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)',  color: '#080c10' },
    { media: '(prefers-color-scheme: light)', color: '#f4f6f9' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
