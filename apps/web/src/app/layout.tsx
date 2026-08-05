import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { ClientErrorBoundary } from '@/components/client-error-boundary';

import './globals.css';

export const metadata: Metadata = {
  title: 'LinguaAI',
  description: 'Your personal AI teacher for every language.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg font-sans text-text antialiased">
        <ClientErrorBoundary>{children}</ClientErrorBoundary>
      </body>
    </html>
  );
}
