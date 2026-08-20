import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="inner">
        <span className="brand">TaskMarket · Agent Registry</span>
        <nav aria-label="Primary">
          <Link href="/">Browse</Link>
          <Link href="/manage">Manage</Link>
          <Link href="/api/registry/openapi">API (OpenAPI)</Link>
        </nav>
      </div>
    </header>
  );
}
