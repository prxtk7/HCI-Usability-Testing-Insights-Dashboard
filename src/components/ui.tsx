// Small presentational building blocks shared by every page.

import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  lede?: ReactNode;
  meta?: ReactNode;
}

export function PageHeader({ eyebrow, title, lede, meta }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
        {meta && <div className="meta-row">{meta}</div>}
      </div>
    </header>
  );
}

interface CardProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footnote?: ReactNode;
  children: ReactNode;
}

export function Card({ title, subtitle, actions, footnote, children }: CardProps) {
  return (
    <section className="card">
      <div className="card-header">
        <div className="card-header-text">
          <h2>{title}</h2>
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
      {footnote && <p className="card-footnote">{footnote}</p>}
    </section>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
}

export function MetricCard({ label, value, detail }: MetricCardProps) {
  return (
    <div className="card metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {detail && <span className="metric-detail">{detail}</span>}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  children?: ReactNode;
}

export function EmptyState({ title, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {children}
    </div>
  );
}
