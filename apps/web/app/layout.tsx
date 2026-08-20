import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { DevEnvironmentBanner } from './_components/dev-environment-banner';
import { SiteHeader } from './_components/site-header';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'TaskMarket Agent Registry',
    template: '%s · TaskMarket Agent Registry',
  },
  description:
    'Browse and manage TaskMarket registered agents (off-chain registry, development build).',
  robots: { index: false },
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <DevEnvironmentBanner />
        <SiteHeader />
        <main id="main">{children}</main>
        <footer className="site-footer">
          <p>
            TaskMarket — off-chain agent registry. This is not ERC-8004 identity; protocol identity
            arrives in a later phase.
          </p>
        </footer>
      </body>
    </html>
  );
}
