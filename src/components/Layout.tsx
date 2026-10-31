import { useState, type ReactNode } from 'react';
import { PAGES, pageHref, type PageId } from '../navigation';

interface LayoutProps {
  currentPage: PageId;
  children: ReactNode;
}

export function Layout({ currentPage, children }: LayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      {/* Shown only on small screens (see global.css). */}
      <header className="topbar">
        <span className="brand-name">HCI Usability Insights</span>
        <button
          type="button"
          className="menu-button"
          aria-expanded={menuOpen}
          aria-controls="primary-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? 'Close menu' : 'Menu'}
        </button>
      </header>

      <aside className="sidebar" id="primary-nav" data-open={menuOpen}>
        <div className="brand">
          <span className="brand-name">HCI Usability Testing &amp; Insights</span>
          <span className="brand-tagline">Portfolio MVP · fictional data</span>
        </div>
        <nav aria-label="Main">
          <ul className="nav-list">
            {PAGES.map((page) => (
              <li key={page.id}>
                <a
                  className="nav-link"
                  href={pageHref(page.id)}
                  aria-current={page.id === currentPage ? 'page' : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  {page.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p className="sidebar-footer">Data is stored only in this browser.</p>
      </aside>

      <main className="main" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
