import { useCallback, useEffect, useRef, useState } from 'react';
// maplibre-gl 6 solo expone exports nombrados (ya no hay default export).
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type MapMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre parsea las teselas en un Web Worker que busca como archivo hermano
// suyo (`new URL('./maplibre-gl-worker.mjs', import.meta.url)`). Al empaquetar,
// import.meta.url pasa a ser el bundle de la app, así que lo pide en
// /assets/maplibre-gl-worker.mjs, que Vite nunca emite: el worker daba 404 y el
// mapa se quedaba en el color de fondo del estilo, sin calles. Con ?worker&url
// Vite lo empaqueta (resolviendo su import de maplibre-gl-shared) y nos da la
// URL final, que le pasamos a MapLibre.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { api } from '../lib/api';
import { Icon } from './Icon';

setWorkerUrl(maplibreWorkerUrl);

/**
 * Selector de ubicación con mapa real (OpenStreetMap).
 *
 * Mismo stack que las apps móviles: MapLibre + teselas de OpenFreeMap. Gratis,
 * sin API key y sin límite de cargas. La búsqueda predictiva y la dirección al
 * arrastrar el pin van por nuestro backend (/geocode), que es quien habla con
 * Nominatim.
 */

// Estilo de teselas ya usado en mobile-client y mobile-vet.
const TILES = 'https://tiles.openfreemap.org/styles/liberty';
// Caracas: el centro por defecto cuando la clínica aún no tiene coordenadas.
const DEFAULT_CENTER: [number, number] = [-66.9036, 10.4806];

export interface PickedLocation {
  lat: number;
  lng: number;
  address?: string;
  city?: string;
  state?: string;
}

interface Suggestion {
  label: string;
  context?: string;
  lat: number;
  lng: number;
  address?: string;
  city?: string;
  state?: string;
}

interface Props {
  lat?: number | null;
  lng?: number | null;
  /** Se llama al elegir una sugerencia, arrastrar el pin o usar el GPS. */
  onPick: (loc: PickedLocation) => void;
}

export function LocationPicker({ lat, lng, onPick }: Props) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // onPick vive en un ref para que los listeners del mapa (que se registran una
  // sola vez) siempre llamen a la versión actual sin recrear el mapa.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const hasCoords = typeof lat === 'number' && typeof lng === 'number';

  /** Pide la dirección de un punto y la propaga hacia arriba. */
  const reverse = useCallback(async (la: number, ln: number) => {
    // Las coordenadas se envían aunque la geocodificación inversa falle: el pin
    // manda, la dirección es un extra.
    onPickRef.current({ lat: la, lng: ln });
    try {
      const res = await api<{ place: Suggestion | null }>(
        `/geocode/reverse?lat=${la}&lng=${ln}`,
      );
      if (res.place) {
        onPickRef.current({
          lat: la,
          lng: ln,
          address: res.place.address,
          city: res.place.city,
          state: res.place.state,
        });
      }
    } catch {
      setNote('No se pudo obtener la dirección de ese punto, pero las coordenadas quedaron guardadas.');
    }
  }, []);

  // ── Crear el mapa (una sola vez) ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: TILES,
      center: hasCoords ? [lng as number, lat as number] : DEFAULT_CENTER,
      zoom: hasCoords ? 16 : 11,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    const marker = new Marker({ color: '#8A2FA0', draggable: true })
      .setLngLat(hasCoords ? [lng as number, lat as number] : DEFAULT_CENTER)
      .addTo(map);

    marker.on('dragend', () => {
      const p = marker.getLngLat();
      setNote(null);
      void reverse(p.lat, p.lng);
    });

    // Un clic en el mapa también mueve el pin: es más rápido que arrastrarlo.
    map.on('click', (e: MapMouseEvent) => {
      marker.setLngLat(e.lngLat);
      setNote(null);
      void reverse(e.lngLat.lat, e.lngLat.lng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Solo al montar: las coordenadas posteriores se sincronizan en el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mantener el pin en sincronía cuando las coordenadas cambian afuera ────
  useEffect(() => {
    if (!hasCoords || !mapRef.current || !markerRef.current) return;
    const next: [number, number] = [lng as number, lat as number];
    const cur = markerRef.current.getLngLat();
    // Evita pelear con el arrastre del usuario por diferencias de redondeo.
    if (Math.abs(cur.lng - next[0]) < 1e-6 && Math.abs(cur.lat - next[1]) < 1e-6) return;
    markerRef.current.setLngLat(next);
    mapRef.current.flyTo({ center: next, zoom: Math.max(mapRef.current.getZoom(), 16) });
  }, [lat, lng, hasCoords]);

  // ── Búsqueda predictiva ───────────────────────────────────────────────────
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    // Espera a que deje de escribir y cancela la consulta anterior: así no
    // disparamos una llamada por tecla.
    const ctrl = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api<{ data: Suggestion[] }>(`/geocode/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;
        setResults(res.data);
        setOpen(true);
      } catch {
        if (!ctrl.signal.aborted) setResults([]);
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  function choose(s: Suggestion) {
    setOpen(false);
    setQuery('');
    setResults([]);
    setNote(null);
    onPickRef.current({ lat: s.lat, lng: s.lng, address: s.address, city: s.city, state: s.state });
    markerRef.current?.setLngLat([s.lng, s.lat]);
    mapRef.current?.flyTo({ center: [s.lng, s.lat], zoom: 17 });
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setNote('Este navegador no permite obtener tu ubicación.');
      return;
    }
    setLocating(true);
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        markerRef.current?.setLngLat([longitude, latitude]);
        mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 17 });
        void reverse(latitude, longitude);
      },
      () => {
        setLocating(false);
        setNote('No pudimos obtener tu ubicación. Revisa los permisos del navegador.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="mb-3">
      {/* Buscador predictivo */}
      <div className="relative mb-2">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
        <input
          className="input pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter') {
              e.preventDefault();
              if (results[0]) choose(results[0]);
            }
          }}
          placeholder="Escribe la dirección: Av. Francisco de Miranda, Chacao…"
          autoComplete="off"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Buscando…</span>
        )}

        {open && results.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-slate-100 bg-white py-1 shadow-soft">
            {results.map((r) => (
              <li key={`${r.lat},${r.lng}`}>
                <button
                  type="button"
                  onClick={() => choose(r)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-brand-50"
                >
                  <Icon name="pin" className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                  <span className="min-w-0 leading-snug">
                    <span className="block truncate text-sm font-medium text-slate-700">{r.label}</span>
                    {r.context && <span className="block truncate text-xs text-slate-400">{r.context}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {open && !searching && query.trim().length >= 3 && results.length === 0 && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm text-slate-500 shadow-soft">
            Sin resultados. Prueba con menos detalle, o mueve el pin en el mapa.
          </div>
        )}
      </div>

      {/* Mapa */}
      <div
        ref={containerRef}
        className="h-64 w-full overflow-hidden rounded-xl border border-slate-100"
        style={{ minHeight: 256 }}
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          Arrastra el pin o haz clic en el mapa para ajustar la ubicación exacta.
        </p>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-brand-600 transition hover:bg-brand-50 disabled:opacity-50"
        >
          {locating ? 'Ubicando…' : 'Usar mi ubicación actual'}
        </button>
      </div>

      {note && <p className="mt-2 text-xs text-migo-amber">{note}</p>}
    </div>
  );
}
