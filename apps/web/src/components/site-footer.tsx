const FOOTER_COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', href: '#how-it-works' },
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Log in', href: '/login' },
      { label: 'Create account', href: '/register' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Privacy Policy', href: '/privacy' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-12 tablet:grid-cols-4">
        <div className="col-span-2 tablet:col-span-1">
          <p className="type-heading-md text-text">LinguaAI</p>
          <p className="mt-2 type-body-sm text-neutral-text">
            Your personal AI teacher for every language.
          </p>
        </div>
        {FOOTER_COLUMNS.map((column) => (
          <div key={column.title}>
            <p className="type-body-sm font-semibold text-text">{column.title}</p>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="type-body-sm text-neutral-text transition-colors duration-micro hover:text-text"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border px-4 py-6">
        <p className="mx-auto max-w-6xl type-caption text-neutral-text">
          © {new Date().getFullYear()} LinguaAI. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
