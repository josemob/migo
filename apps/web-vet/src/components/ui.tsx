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

/** Tarjeta de énfasis en morado profundo (el equivalente Migo a las tarjetas negras). */
export function DarkCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card-dark p-6 ${className}`}>{children}</div>;
}

/** Número grande con etiqueta e icono, para la cabecera del dashboard. */
export function StatBig({
  value,
  label,
  icon,
}: {
  value: ReactNode;
  label: string;
  icon?: ReactNode;
}) {
  return (
    <div className="min-w-[104px]">
      <div className="font-heading text-[40px] font-extrabold leading-none tracking-tight text-brand-900">
        {value}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
    </div>
  );
}

/** Barra segmentada (tipo "Interviews / Hired / Output") con su leyenda de chips. */
export function SegmentBar({
  segments,
}: {
  segments: { label: string; value: number; className: string; chip: string }[];
}) {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0));
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      {segments.map((s) => (
        <div key={s.label} className="flex items-center gap-2">
          <span className={`rounded-pill px-3 py-1 text-xs font-bold ${s.chip}`}>
            {Math.round((s.value / total) * 100)}%
          </span>
          <span className="text-xs font-medium text-slate-500">{s.label}</span>
        </div>
      ))}
      <div className="flex h-2.5 min-w-[160px] flex-1 overflow-hidden rounded-pill bg-slate-200/70">
        {segments.map((s) => (
          <div
            key={s.label}
            className={s.className}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
    </div>
  );
}

/** Anillo de progreso con el valor al centro. */
export function RingProgress({
  percent,
  label,
  sub,
  size = 168,
}: {
  percent: number;
  label: string;
  sub?: string;
  size?: number;
}) {
  const p = Math.max(0, Math.min(100, percent));
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EFE7F3" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#F6DE1E"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * p) / 100}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-heading text-3xl font-extrabold text-brand-900">{label}</span>
        {sub && <span className="mt-0.5 text-[11px] font-medium text-slate-400">{sub}</span>}
      </div>
    </div>
  );
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
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-migo-purple">
            {icon}
          </span>
        )}
      </div>
      <div className="font-heading text-2xl font-extrabold text-brand-900">{value}</div>
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
