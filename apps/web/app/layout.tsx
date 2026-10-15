import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Argon // Knowledge Architecture Engine',
  description: 'Mathematical graph briefings grounded in FalkorDB with 100% citation integrity.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
