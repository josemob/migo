import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Card, DarkCard, ErrorNote, RingProgress, SegmentBar, Spinner, StatBig } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';

interface Overview {
  comerciosActivos: number;
  emergenciasHoy: number;
  gmvMensual: number;
  revenueMigo: number;
  vetsGuardia: number;
  solicitudes: number;
  suspendidos: number;
  trend: { label: string; revenue: number; emergencies: number }[];
}

const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const hoy = () =>
  new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' });

export default function General() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-overview'], queryFn: () => api<Overview>('/admin/overview') });
  const firstName = user?.fullName?.split(' ')[0] ?? 'Admin';

  return (
    <div>
      {/* ── Cabecera: saludo + números grandes ───────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-heading text-[42px] font-extrabold leading-tight tracking-tight text-brand-900">
            Hola de nuevo, {firstName}
          </h1>
          <p className="mt-1 text-sm capitalize text-slate-500">{hoy()}</p>
        </div>

        {data && (
          <div className="flex items-start gap-9">
            <StatBig value={data.comerciosActivos} label="Comercios" icon={<Icon name="store" className="h-3.5 w-3.5" />} />
            <StatBig value={data.vetsGuardia} label="Veterinarios" icon={<Icon name="hospital" className="h-3.5 w-3.5" />} />
            <StatBig value={data.emergenciasHoy} label="Urgencias hoy" icon={<Icon name="emergency" className="h-3.5 w-3.5" />} />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-24"><Spinner /></div>
      ) : error ? (
        <div className="mt-8"><ErrorNote error={error} /></div>
      ) : data ? (
        <>
          {/* ── Barra segmentada: composición de la red de comercios ──────── */}
          <div className="mt-7">
            <SegmentBar
              segments={[
                { label: 'Activos', value: data.comerciosActivos, className: 'bg-brand-500', chip: 'bg-brand-900 text-white' },
                { label: 'Por verificar', value: data.solicitudes, className: 'bg-accent-300', chip: 'bg-accent-300 text-brand-900' },
                { label: 'Suspendidos', value: data.suspendidos, className: 'bg-red-400', chip: 'bg-red-100 text-red-700' },
              ]}
            />
          </div>

          {/* ── Bento grid ───────────────────────────────────────────────── */}
          <div className="mt-6 grid grid-cols-12 gap-5">
            {/* Facturación (tarjeta de énfasis, ocupa dos filas) */}
            <DarkCard className="col-span-12 flex flex-col lg:col-span-4 lg:row-span-2">
              <div className="flex items-start justify-between">
                <span className="text-sm font-medium text-white/60">Facturación del mes</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                  <Icon name="finance" className="h-4 w-4 text-accent-300" />
                </span>
              </div>

              <div className="mt-6">
                <div className="font-heading text-[46px] font-extrabold leading-none tracking-tight">
                  {usd(data.gmvMensual)}
                </div>
                <div className="mt-2 text-sm text-white/50">Volumen transado (GMV)</div>
              </div>

              <div className="mt-7 rounded-2xl bg-white/[0.07] p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-white/60">Revenue Migo</span>
                  <span className="font-heading text-2xl font-extrabold text-accent-300">{usd(data.revenueMigo)}</span>
                </div>
                <div className="mt-1 text-xs text-white/40">Comisiones + leads</div>
              </div>

              <Link
                to="/finanzas"
                className="mt-auto flex items-center justify-between rounded-pill bg-accent-300 px-5 py-3 font-heading text-sm font-bold text-brand-900 transition hover:brightness-105"
              >
                Ver liquidaciones
                <Icon name="chevronRight" className="h-4 w-4" />
              </Link>
            </DarkCard>

            {/* Tendencias semanales */}
            <Card className="col-span-12 lg:col-span-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-heading text-lg font-bold text-brand-900">Tendencias</h2>
                  <p className="mt-0.5 text-xs text-slate-400">Últimos días · urgencias y revenue</p>
                </div>
                <Link to="/finanzas" className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-migo-purple transition hover:bg-brand-100">
                  <Icon name="chevronRight" className="h-4 w-4" />
                </Link>
              </div>
              <TrendChart trend={data.trend} />
              <div className="mt-4 flex items-center gap-5 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-brand-500" /> Urgencias</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-accent-300" /> Revenue del día</span>
              </div>
            </Card>

            {/* Take rate (anillo) */}
            <Card className="col-span-12 flex flex-col items-center lg:col-span-3">
              <div className="flex w-full items-start justify-between">
                <h2 className="font-heading text-lg font-bold text-brand-900">Take rate</h2>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-migo-purple">
                  <Icon name="chart" className="h-4 w-4" />
                </span>
              </div>
              {/* Sin GMV el take rate no está definido: mostramos "—" en vez de un 0% engañoso. */}
              <div className="my-2">
                <RingProgress
                  percent={data.gmvMensual > 0 ? (data.revenueMigo / data.gmvMensual) * 100 : 0}
                  label={data.gmvMensual > 0 ? `${((data.revenueMigo / data.gmvMensual) * 100).toFixed(1)}%` : '—'}
                  sub={data.gmvMensual > 0 ? 'del GMV' : 'sin volumen'}
                />
              </div>
              <p className="text-center text-xs text-slate-400">
                {data.gmvMensual > 0
                  ? 'Lo que Migo retiene de cada dólar transado en la red.'
                  : 'Aún no hay volumen transado este mes.'}
              </p>
            </Card>

            {/* Requiere tu atención (tarjeta oscura con lista) */}
            <DarkCard className="col-span-12 lg:col-span-4">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-lg font-bold">Requiere tu atención</h2>
                <span className="rounded-pill bg-accent-300 px-2.5 py-1 font-heading text-xs font-extrabold text-brand-900">
                  {data.solicitudes + data.suspendidos}
                </span>
              </div>
              <div className="mt-5 space-y-2.5">
                <TaskRow to="/comercios" icon="store" label="Comercios por verificar" count={data.solicitudes} />
                <TaskRow to="/comercios" icon="warning" label="Comercios suspendidos" count={data.suspendidos} tone="red" />
                <TaskRow to="/especialidades" icon="shield" label="Solicitudes de especialidad" />
                <TaskRow to="/veterinarios" icon="hospital" label="Verificación de veterinarios" />
              </div>
            </DarkCard>

            {/* Salud de la red */}
            <Card className="col-span-12 lg:col-span-4">
              <h2 className="font-heading text-lg font-bold text-brand-900">Salud de la red</h2>
              <div className="mt-4 space-y-2.5">
                <MiniStat icon="hospital" tone="text-migo-purple" bg="bg-brand-50" label="Veterinarios en la red" value={`${data.vetsGuardia}`} hint="Registrados en la plataforma" />
                <MiniStat icon="emergency" tone="text-migo-red" bg="bg-red-50" label="Urgencias de hoy" value={`${data.emergenciasHoy}`} hint="Alertas generadas" />
                <MiniStat icon="store" tone="text-migo-green" bg="bg-green-50" label="Comercios activos" value={`${data.comerciosActivos}`} hint="Clínicas y aliados operando" />
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Barras del gráfico: la de mayor revenue se resalta en amarillo con su etiqueta. */
function TrendChart({ trend }: { trend: Overview['trend'] }) {
  const maxRev = Math.max(1, ...trend.map((t) => t.revenue));
  const maxEmg = Math.max(1, ...trend.map((t) => t.emergencies));
  const peak = trend.reduce((best, t, i) => (t.revenue > trend[best].revenue ? i : best), 0);

  return (
    <div className="mt-6 flex h-44 items-end justify-between gap-3">
      {trend.map((t, i) => {
        const isPeak = i === peak && t.revenue > 0;
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-2">
            {isPeak && (
              <span className="rounded-pill bg-accent-300 px-2 py-0.5 font-heading text-[10px] font-extrabold text-brand-900">
                ${t.revenue}
              </span>
            )}
            <div className={`flex w-full items-end justify-center gap-1 ${isPeak ? 'h-28' : 'h-32'}`}>
              <div
                className="w-2.5 rounded-pill bg-brand-500"
                style={{ height: `${Math.max(4, (t.emergencies / maxEmg) * 100)}%` }}
                title={`${t.emergencies} urgencias`}
              />
              <div
                className={`w-2.5 rounded-pill ${isPeak ? 'bg-accent-300' : 'bg-brand-100'}`}
                style={{ height: `${Math.max(4, (t.revenue / maxRev) * 100)}%` }}
                title={`$${t.revenue}`}
              />
            </div>
            <span className="text-xs text-slate-400">{t.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function TaskRow({
  to,
  icon,
  label,
  count,
  tone = 'default',
}: {
  to: string;
  icon: IconName;
  label: string;
  count?: number;
  tone?: 'default' | 'red';
}) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-2xl bg-white/[0.07] px-4 py-3 transition hover:bg-white/[0.12]">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <Icon name={icon} className={`h-4 w-4 ${tone === 'red' ? 'text-red-300' : 'text-accent-300'}`} />
      </span>
      <span className="flex-1 text-sm font-medium text-white/85">{label}</span>
      {count != null && count > 0 && (
        <span className={`rounded-pill px-2 py-0.5 text-xs font-bold ${tone === 'red' ? 'bg-red-400/20 text-red-200' : 'bg-accent-300 text-brand-900'}`}>
          {count}
        </span>
      )}
      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-white/30" />
    </Link>
  );
}

function MiniStat({
  icon,
  tone,
  bg,
  label,
  value,
  hint,
}: {
  icon: IconName;
  tone: string;
  bg: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50/80 px-4 py-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${bg}`}>
        <Icon name={icon} className={`h-4 w-4 ${tone}`} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-700">{label}</div>
        <div className="truncate text-xs text-slate-400">{hint}</div>
      </div>
      <div className="font-heading text-xl font-extrabold text-brand-900">{value}</div>
    </div>
  );
}
