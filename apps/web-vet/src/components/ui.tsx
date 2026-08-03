import type { ReactNode } from 'react';

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`h-8 w-8 animate-spin rounded-full border-4 border-migo-purple/20 border-t-migo-purple ${className}`}
    />
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold text-migo-heading">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card p-6 ${className}`}>{children}</div>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-4 text-lg font-bold text-migo-heading">{children}</h2>;
}

const badgeTones: Record<string, string> = {
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  purple: 'bg-violet-100 text-violet-700',
  amber: 'bg-amber-100 text-amber-700',
  blue: 'bg-blue-100 text-blue-700',
  slate: 'bg-slate-100 text-slate-600',
};

export function Badge({ tone = 'slate', children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge ${badgeTones[tone] ?? badgeTones.slate}`}>{children}</span>;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="card flex flex-col gap-2 p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{label}</span>
        {icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-migo-purple">
            {icon}
          </span>
        )}
      </div>
      <div className="text-2xl font-extrabold text-slate-900">{value}</div>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-slate-200 py-12 text-sm text-slate-400">
      {children}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : 'Ocurrió un error';
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {msg}
    </div>
  );
}
