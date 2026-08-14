import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { ClientErrorBoundary } from '@/components/client-error-boundary';
import { QueryProvider } from '@/components/query-provider';
import { ThemeProvider } from '@/components/theme-provider';

import './globals.css';

export const metadata: Metadata = {
  title: 'LinguaAI',
  description: 'Your personal AI teacher for every language.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-bg font-sans text-text antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-md focus:bg-primary-solid focus:px-4 focus:py-2 focus:type-body-sm focus:font-semibold focus:text-white"
        >
          Skip to main content
        </a>
        <ClientErrorBoundary>
          <ThemeProvider>
            <QueryProvider>{children}</QueryProvider>
          </ThemeProvider>
        </ClientErrorBoundary>
      </body>
    </html>
  );
}
