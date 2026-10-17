import type { Metadata, Viewport } from 'next';
import { Agentation } from 'agentation';
import './globals.css';

export const metadata: Metadata = {
  title: 'Argon — What must I know before I touch this?',
  description:
    'Evidence-backed architectural briefings grounded in a FalkorDB knowledge graph. No graph, no answer.',
};

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
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
        {process.env.NODE_ENV === 'development' && (
          <Agentation endpoint="http://localhost:4747" />
        )}
      </body>
    </html>
  );
}

