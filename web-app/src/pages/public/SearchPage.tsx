import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, MapPin, List, Star, Clock, Zap, SlidersHorizontal, X } from 'lucide-react';
import { marketplaceAPI, zonesAPI } from '../../services/api';
import QuickRequestModal from '../../components/QuickRequestModal';
import BookingModal from '../../components/BookingModal';
import LiveMap, { KYIV_CENTER, MapPoint, MapZone } from '../../components/LiveMap';
import { useRealtimeEvents } from '../../hooks/useRealtimeSocket';

const FILTERS = [
  { id: 'open', label: 'Открыто сейчас' },
  { id: 'outcall', label: 'Выезд' },
  { id: 'rating', label: 'Рейтинг 4.5+' },
  { id: 'verified', label: 'Проверенные' },
  { id: 'urgent', label: 'Срочно' },
  { id: 'near5', label: 'До 5 км' },
];
const SORTS = [
  { id: 'recommended', label: 'Рекомендовано' },
  { id: 'closest',     label: 'Ближе'         },
  { id: 'fastest',     label: 'Быстрее'       },
  { id: 'cheapest',    label: 'Дешевле'       },
  { id: 'rating',      label: 'Рейтинг'       },
];

export default function SearchPage() {
  const [sp, setSp] = useSearchParams();
  const view = sp.get('view') || 'list';
  const [q, setQ] = useState(sp.get('q') || '');
  const [providers, setProviders] = useState<any[]>([]);
  const [active, setActive] = useState<string[]>(['open']);
  const [sort, setSort] = useState('recommended');
  const [priceMax, setPriceMax] = useState(5000);
  const [services, setServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zones, setZones] = useState<any[]>([]);

  useEffect(() => {
    marketplaceAPI.getProviders().then(r => {
      const items = (r.data?.providers || r.data?.items || r.data || []).map((p: any) => ({
        ...p,
        id: p.id || p._id || p.slug,
        lat: p.lat ?? p.location?.coordinates?.[1],
        lng: p.lng ?? p.location?.coordinates?.[0],
        distanceKm: p.distanceKm ?? p.distance ?? null,
        etaMinutes: p.etaMinutes ?? p.eta ?? null,
        trustBadges: p.trustBadges || p.badges || [],
      }));
      setProviders(items);
    }).finally(() => setLoading(false));
    zonesAPI.getLiveState().then(r => setZones(r.data?.zones || r.data?.items || [])).catch(() => {});
  }, []);

  useRealtimeEvents(['zone:updated', 'provider:online', 'provider:offline'], () => {
    zonesAPI.getLiveState().then(r => setZones(r.data?.zones || r.data?.items || [])).catch(() => {});
    marketplaceAPI.getProviders().then(r => setProviders(r.data.providers || [])).catch(() => {});
  });

  const toggle = (f: string, set: any) => set((p: string[]) => p.includes(f) ? p.filter(x => x !== f) : [...p, f]);
  const setView = (v: string) => { sp.set('view', v); setSp(sp); };

  const filtered = useMemo(() => {
    let list = providers.filter(p => q ? (p.name || '').toLowerCase().includes(q.toLowerCase()) || (p.spec || '').toLowerCase().includes(q.toLowerCase()) : true);
    if (active.includes('open'))     list = list.filter(p => !p.status || p.status === 'open' || p.status === 'active');
    if (active.includes('rating'))   list = list.filter(p => (p.ratingAvg ?? 0) >= 4.5);
    if (active.includes('verified')) list = list.filter(p => (p.trustBadges || []).some((b: string) => b.toLowerCase().includes('проверен')));
    if (active.includes('near5'))    list = list.filter(p => (p.distanceKm ?? 99) < 5);
    list = list.filter(p => (p.priceFrom ?? 500) <= priceMax);

    if (sort === 'closest')  list = [...list].sort((a, b) => (a.distanceKm || 99) - (b.distanceKm || 99));
    if (sort === 'fastest')  list = [...list].sort((a, b) => (a.etaMinutes || 99) - (b.etaMinutes || 99));
    if (sort === 'cheapest') list = [...list].sort((a, b) => (a.priceFrom || 9999) - (b.priceFrom || 9999));
    if (sort === 'rating')   list = [...list].sort((a, b) => (b.ratingAvg || 0) - (a.ratingAvg || 0));
    return list;
  }, [providers, q, active, sort, priceMax]);

  const allServices = useMemo(() => {
    const s = new Set<string>();
    providers.forEach(p => (p.services || []).forEach((x: string) => s.add(x)));
    return Array.from(s).slice(0, 12);
  }, [providers]);

  const onBook = (p: any) => { setSelectedProvider(p); setBookingOpen(true); };

  return (
    <div className="bg-black min-h-screen">
      {/* Top search bar */}
      <section className="hairline-b sticky top-[64px] z-30 bg-black/95 backdrop-blur-md">
        <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-4 grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3 items-center">
          <div className="input-shell">
            <Search size={16} className="text-amber" />
            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Услуга, СТО, проблема" data-testid="search-input" />
          </div>
          <div className="tab-group" data-testid="view-tabs">
            <button onClick={() => setView('list')} className={`tab-pill flex items-center gap-1.5 ${view === 'list' ? 'active' : ''}`} data-testid="view-list">
              <List size={12} /> СПИСОК
            </button>
            <button onClick={() => setView('map')} className={`tab-pill flex items-center gap-1.5 ${view === 'map' ? 'active' : ''}`} data-testid="view-map">
              <MapPin size={12} /> КАРТА
            </button>
          </div>
          <button onClick={() => setFiltersOpen(true)} className="btn-secondary lg:hidden" data-testid="open-filters">
            <SlidersHorizontal size={14} /> ФИЛЬТРЫ
          </button>
        </div>
      </section>

      <div
        className={
          view === 'map'
            ? 'max-w-[1600px] mx-auto px-4 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)] gap-4'
            : 'max-w-[1600px] mx-auto px-4 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-6'
        }
        data-testid={`search-grid-${view}`}
      >
        {/* ============ LEFT FILTERS (desktop sticky) ============ */}
        <aside className="hidden lg:block sticky top-[136px] self-start" data-testid="filters-aside">
          <FiltersPanel
            active={active}
            onToggle={(f) => toggle(f, setActive)}
            priceMax={priceMax}
            onPrice={setPriceMax}
            services={services}
            onService={(s) => toggle(s, setServices)}
            allServices={allServices}
          />
        </aside>

        {/* Mobile filters drawer */}
        {filtersOpen && (
          <div className="lg:hidden fixed inset-0 z-50 modal-backdrop" onClick={() => setFiltersOpen(false)}>
            <div className="absolute right-0 top-0 bottom-0 w-[88%] max-w-sm modal-content overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
              <button onClick={() => setFiltersOpen(false)} className="absolute top-4 right-4 w-9 h-9 surface-chip flex items-center justify-center" style={{ borderRadius: 999 }}>
                <X size={16} className="text-amber" />
              </button>
              <FiltersPanel
                active={active}
                onToggle={(f) => toggle(f, setActive)}
                priceMax={priceMax}
                onPrice={setPriceMax}
                services={services}
                onService={(s) => toggle(s, setServices)}
                allServices={allServices}
              />
            </div>
          </div>
        )}

        {/* ============ CENTER LIST ============ */}
        <section className="min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 slash-label">
              <span className="live-dot" /> {filtered.length} РЕЗУЛЬТАТОВ
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xs uppercase tracking-widest hidden sm:inline" style={{ color: '#8A8A8A' }}>Сортировка</span>
              <select value={sort} onChange={e => setSort(e.target.value)} className="select-dark !w-auto !h-9 text-xs" data-testid="sort-select">
                {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {view === 'map' ? (
            <div className="space-y-3 lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto pr-1" data-testid="map-list">
              {loading ? (
                <p className="text-center py-10 text-sm" style={{ color: '#8A8A8A' }}>Загрузка…</p>
              ) : filtered.length === 0 ? (
                <div className="card text-center py-10">
                  <p className="text-sm" style={{ color: '#B8B8B8' }}>По текущим фильтрам ничего не найдено</p>
                </div>
              ) : (
                filtered.map(p => (
                  <div
                    key={p.id}
                    onMouseEnter={() => setSelectedId(p.id)}
                    onClick={() => setSelectedId(p.id)}
                    className={selectedId === p.id ? 'ring-1 ring-amber rounded-md' : ''}
                    data-testid={`map-row-${p.id}`}
                  >
                    <ListRow p={p} onBook={() => onBook(p)} />
                  </div>
                ))
              )}
            </div>
          ) : loading ? (
            <p className="text-center py-10 text-sm" style={{ color: '#8A8A8A' }}>Загрузка…</p>
          ) : filtered.length === 0 ? (
            <div className="card text-center py-12">
              <p className="mb-4" style={{ color: '#B8B8B8' }}>По текущим фильтрам ничего не найдено</p>
              <button onClick={() => setQuickOpen(true)} className="btn-primary">Быстрый запрос</button>
            </div>
          ) : (
            <div className="space-y-3" data-testid="search-list">
              {filtered.map(p => <ListRow key={p.id} p={p} onBook={() => onBook(p)} />)}
            </div>
          )}
        </section>

        {/* ============ RIGHT MAP / DEMAND ============ */}
        {view === 'map' ? (
          <aside className="lg:sticky lg:top-[136px] self-start" data-testid="map-aside">
            <div className="card-elevated !p-0 overflow-hidden">
              <LiveMap
                height="calc(100vh - 180px)"
                points={filtered.filter(p => p.lat && p.lng).map((p): MapPoint => ({
                  id: p.id,
                  lat: p.lat,
                  lng: p.lng,
                  label: p.name,
                  status: p.status || 'open',
                  onClick: () => setSelectedId(p.id),
                }))}
                zones={zones.map((z: any, i: number): MapZone => ({
                  id: z.id || `z-${i}`,
                  lat: z.lat ?? z.center?.lat ?? (KYIV_CENTER[0] + (i % 3 - 1) * 0.04),
                  lng: z.lng ?? z.center?.lng ?? (KYIV_CENTER[1] + (Math.floor(i / 3) - 1) * 0.05),
                  radiusKm: z.radiusKm || 1.5,
                  level: (z.surgeLevel || z.level || 'balanced').toLowerCase() as MapZone['level'],
                  label: z.name || z.zoneName,
                  multiplier: z.surgeMultiplier,
                }))}
                selectedId={selectedId}
              />
            </div>
          </aside>
        ) : (
          <aside className="hidden lg:block sticky top-[136px] self-start" data-testid="demand-aside">
            <DemandPanel providersCount={filtered.length} />
          </aside>
        )}
      </div>

      {/* FAB */}
      <button onClick={() => setQuickOpen(true)} className="btn-primary fixed bottom-5 right-5 z-30 shadow-lg" data-testid="search-fab">
        <Zap size={16} fill="currentColor" /> БЫСТРЫЙ ЗАПРОС
      </button>

      <QuickRequestModal isOpen={quickOpen} onClose={() => setQuickOpen(false)} />
      <BookingModal isOpen={bookingOpen} onClose={() => setBookingOpen(false)} provider={selectedProvider} />
    </div>
  );
}

function FiltersPanel({ active, onToggle, priceMax, onPrice, services, onService, allServices }: any) {
  return (
    <div className="card-elevated space-y-5" data-testid="filters-panel">
      <div>
        <div className="slash-label mb-3">ФИЛЬТРЫ</div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f: any) => (
            <button key={f.id} onClick={() => onToggle(f.id)} className={`chip ${active.includes(f.id) ? 'chip-active' : ''}`} data-testid={`f-${f.id}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="hairline-t pt-4">
        <div className="slash-label mb-2">ЦЕНА ДО</div>
        <div className="flex items-center justify-between text-sm mb-2">
          <span style={{ color: '#8A8A8A' }} className="text-xs">от 200 ₴</span>
          <span className="font-display tracking-bebas text-2xl text-amber">{priceMax} ₴</span>
        </div>
        <input
          type="range"
          min={500}
          max={10000}
          step={100}
          value={priceMax}
          onChange={e => onPrice(Number(e.target.value))}
          className="w-full accent-amber"
          data-testid="price-slider"
        />
      </div>

      {allServices.length > 0 && (
        <div className="hairline-t pt-4">
          <div className="slash-label mb-3">УСЛУГИ</div>
          <div className="flex flex-wrap gap-2">
            {allServices.map((s: string) => (
              <button key={s} onClick={() => onService(s)} className={`chip ${services.includes(s) ? 'chip-active' : ''}`} data-testid={`svc-${s}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ListRow({ p, onBook }: { p: any; onBook: () => void }) {
  return (
    <div className="provider-card p-5 flex flex-col md:flex-row gap-5" data-testid={`row-${p.slug || p.id}`}>
      {p.img ? (
        <img src={p.img} alt={p.name} className="w-full md:w-32 h-32 object-cover" style={{ borderRadius: 8 }} />
      ) : (
        <div className="w-full md:w-32 h-32 surface-chip flex items-center justify-center">
          <span className="slash-label">СТО</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <Link to={`/provider/${p.slug || p.id}`}>
            <h3 className="font-display tracking-bebas text-2xl hover:text-amber transition-colors">{p.name}</h3>
          </Link>
          <span className="badge">{p.status === 'closed' ? 'Закрыт' : 'Открыт'}</span>
        </div>
        <p className="text-xs mt-0.5" style={{ color: '#8A8A8A' }}>{p.spec || p.services?.slice(0, 2).join(', ') || 'Универсал'}</p>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {(p.trustBadges || []).slice(0, 4).map((b: string, i: number) => (
            <span key={i} className="badge badge-muted">{b.toUpperCase()}</span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs">
          <span className="flex items-center gap-1"><Star size={12} className="text-amber" fill="currentColor" /><span className="text-white font-semibold">{p.ratingAvg ?? '—'}</span><span style={{ color: '#8A8A8A' }}>({p.reviewsCount ?? 0})</span></span>
          <span className="flex items-center gap-1"><MapPin size={12} className="text-amber" /><span className="text-white">{p.distanceKm ?? '—'} км</span></span>
          <span className="flex items-center gap-1"><Clock size={12} className="text-amber" /><span className="text-white">{p.etaMinutes ?? '—'} мин</span></span>
        </div>
      </div>
      <div className="flex md:flex-col items-end justify-between gap-3 md:min-w-[160px]">
        <div className="text-right">
          <div className="text-2xs uppercase tracking-widest" style={{ color: '#8A8A8A' }}>от</div>
          <div className="font-display tracking-bebas text-3xl text-amber leading-none">{p.priceFrom ?? 500} ₴</div>
        </div>
        <div className="flex md:flex-col gap-2 w-full md:w-auto">
          <button onClick={onBook} className="btn-primary btn-sm" data-testid={`row-book-${p.id}`}>Записаться</button>
          <Link to={`/provider/${p.slug || p.id}`} className="btn-secondary btn-sm" data-testid={`row-detail-${p.id}`}>Профиль</Link>
        </div>
      </div>
    </div>
  );
}

function DemandPanel({ providersCount }: { providersCount: number }) {
  return (
    <div className="card-elevated space-y-4" data-testid="demand-panel">
      <div className="flex items-center justify-between">
        <div className="slash-label">СПРОС В РАЙОНЕ</div>
        <span className="flex items-center gap-1.5 text-2xs uppercase tracking-widest text-amber font-bold">
          <span className="live-dot" /> LIVE
        </span>
      </div>

      <div className="surface-chip aspect-[4/5] flex items-center justify-center flex-col gap-3 p-4 text-center">
        <MapPin size={32} className="text-amber" />
        <div>
          <div className="font-display tracking-bebas text-xl">КАРТА СПРОСА</div>
          <p className="text-xs mt-1" style={{ color: '#8A8A8A' }}>Зоны спроса обновляются live</p>
        </div>
      </div>

      <div className="space-y-2">
        <Row label="Активных мастеров" value={String(providersCount)} />
        <Row label="Свободных слотов"  value="32" />
        <Row label="Среднее ETA"       value="8 мин" />
        <Row label="Уровень спроса"    value="Высокий" />
      </div>

      <Link to="/search?view=map" className="btn-secondary w-full">Открыть карту</Link>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-2xs uppercase tracking-widest" style={{ color: '#8A8A8A' }}>{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}
