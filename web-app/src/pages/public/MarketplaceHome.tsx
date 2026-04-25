import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search, MapPin, Star, Zap, Clock, ArrowRight, AlertTriangle, Phone, Wrench, ShieldCheck,
  BatteryCharging, Car, ChevronRight, TrendingUp, Activity,
} from 'lucide-react';
import QuickRequestModal from '../../components/QuickRequestModal';
import BookingModal from '../../components/BookingModal';
import { marketplaceAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useRealtimeEvents } from '../../hooks/useRealtimeSocket';

const PROBLEMS = [
  { id: 'wont-start',  label: 'Не заводится', icon: AlertTriangle },
  { id: 'tow',         label: 'Эвакуатор',    icon: Phone },
  { id: 'diagnostics', label: 'Диагностика',  icon: Search },
  { id: 'oil',         label: 'Замена масла', icon: Wrench },
  { id: 'brakes',      label: 'Тормоза',      icon: ShieldCheck },
  { id: 'electric',    label: 'Электрика',    icon: Zap },
  { id: 'battery',     label: 'Прикурить',    icon: BatteryCharging },
  { id: 'suspension',  label: 'Подвеска',     icon: Car },
];

export default function MarketplaceHome() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [quickOpen, setQuickOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [q, setQ] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [pr, st] = await Promise.all([marketplaceAPI.getProviders(), marketplaceAPI.getStats()]);
      setProviders(pr.data.providers || []);
      setStats(st.data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchData(); const t = setInterval(fetchData, 30000); return () => clearInterval(t); }, [fetchData]);
  useRealtimeEvents(['zone:updated', 'provider:online'], () => fetchData());

  const onBook = (p: any) => { setSelectedProvider(p); setBookingOpen(true); };
  const submitSearch = (e: React.FormEvent) => { e.preventDefault(); navigate(`/search${q ? `?q=${encodeURIComponent(q)}` : ''}`); };

  const providersOnline = stats?.providersNearby ?? providers.length ?? 0;
  const avgEta = stats?.avgEta ?? 8;
  const avgRating = stats?.avgRating ?? 4.8;
  const demandLevel = stats?.demandLevel || 'высокий';

  return (
    <div className="bg-ink-0 text-white">
      {/* ============ HERO: SEARCH + STATS + CHIPS ============ */}
      <section className="max-w-[1600px] mx-auto px-4 lg:px-8 pt-8 pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          {/* Left: search + chips */}
          <div className="card-elevated">
            <div className="slash-label mb-3">{user ? `ПРИВЕТ, ${(user.firstName || user.email || '').toUpperCase()}` : 'НАЙТИ МАСТЕРА'}</div>
            <h1 className="font-display tracking-bebas text-[40px] md:text-[56px] leading-[1] mb-6">
              ЧТО СЛУЧИЛОСЬ <span className="text-amber">С МАШИНОЙ?</span>
            </h1>

            <form onSubmit={submitSearch} className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 mb-5" data-testid="home-search-form">
              <div className="input-shell input-lg">
                <Search size={18} className="text-amber" />
                <input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  type="text"
                  placeholder="Услуга, СТО или проблема (напр. диагностика)"
                  data-testid="home-search-input"
                />
                <span className="hidden md:flex items-center gap-1 pl-3 text-2xs uppercase tracking-widest" style={{ color: '#8A8A8A', borderLeft: '1px solid #2E2E2E', paddingLeft: 12 }}>
                  <MapPin size={12} className="text-amber" /> Киев
                </span>
              </div>
              <button type="submit" className="btn-primary btn-lg" data-testid="home-search-submit">
                ПОИСК <ArrowRight size={16} />
              </button>
            </form>

            <div className="slash-label mb-3">ЧАСТЫЕ ПРОБЛЕМЫ</div>
            <div className="flex flex-wrap gap-2" data-testid="problem-chips">
              {PROBLEMS.map(p => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.id}
                    onClick={() => setQuickOpen(true)}
                    className="chip"
                    data-testid={`problem-${p.id}`}
                  >
                    <Icon size={14} className="text-amber" /> {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: live stats + quick action */}
          <div className="card-elevated flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="slash-label">LIVE СТАТУС</span>
              <span className="flex items-center gap-1.5 text-2xs uppercase tracking-widest text-amber font-bold">
                <span className="live-dot" /> ONLINE
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Мастеров онлайн" value={`${providersOnline}+`} icon={Activity} />
              <StatTile label="Среднее ETA"     value={`${avgEta} мин`}     icon={Clock} />
              <StatTile label="Рейтинг"         value={`${avgRating}★`}     icon={Star} />
              <StatTile label="Спрос"           value={demandLevel}        icon={TrendingUp} />
            </div>

            <button onClick={() => setQuickOpen(true)} className="btn-primary btn-lg w-full" data-testid="home-quick-cta">
              <Zap size={16} fill="currentColor" /> БЫСТРЫЙ ЗАПРОС
            </button>
            <Link to="/search?view=map" className="btn-secondary w-full" data-testid="home-map-cta">
              <MapPin size={14} /> ПОСМОТРЕТЬ КАРТУ
            </Link>
          </div>
        </div>
      </section>

      {/* ============ RECOMMENDED NEARBY ============ */}
      <section className="max-w-[1600px] mx-auto px-4 lg:px-8 py-6" data-testid="recommended-section">
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="slash-label mb-2">РЕКОМЕНДОВАНО</div>
            <h2 className="font-display tracking-bebas text-3xl md:text-4xl">МАСТЕРА РЯДОМ</h2>
          </div>
          <Link to="/search" className="btn-ghost" data-testid="see-all">ВСЕ <ChevronRight size={14} /></Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="recommended-grid">
          {providers.slice(0, 6).map(p => <ProviderCard key={p.id} p={p} onBook={() => onBook(p)} />)}
          {providers.length === 0 && (
            <div className="card text-center py-12 col-span-full" style={{ color: '#8A8A8A' }}>
              Загрузка мастеров…
            </div>
          )}
        </div>
      </section>

      {/* ============ QUICK CATEGORIES ============ */}
      <section className="max-w-[1600px] mx-auto px-4 lg:px-8 py-6" data-testid="categories-section">
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="slash-label mb-2">КАТЕГОРИИ</div>
            <h2 className="font-display tracking-bebas text-3xl md:text-4xl">ПО ТИПУ УСЛУГИ</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {PROBLEMS.map(p => {
            const Icon = p.icon;
            return (
              <Link
                to={`/search?q=${encodeURIComponent(p.label)}`}
                key={p.id}
                className="card-interactive flex flex-col items-center justify-center gap-2 !p-4 aspect-square"
                data-testid={`cat-${p.id}`}
              >
                <span className="icon-badge-soft"><Icon size={18} /></span>
                <span className="text-xs font-semibold text-center">{p.label}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <QuickRequestModal isOpen={quickOpen} onClose={() => setQuickOpen(false)} />
      <BookingModal isOpen={bookingOpen} onClose={() => setBookingOpen(false)} provider={selectedProvider} />
    </div>
  );
}

function StatTile({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="surface-chip !p-3 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-2xs uppercase tracking-widest" style={{ color: '#8A8A8A' }}>{label}</span>
        <Icon size={12} className="text-amber" />
      </div>
      <span className="font-display tracking-bebas text-2xl text-amber">{value}</span>
    </div>
  );
}

function ProviderCard({ p, onBook }: { p: any; onBook: () => void }) {
  const status = p.status === 'closed' ? 'Закрыто' : p.status === 'busy' ? 'Скоро занят' : 'Открыт';
  return (
    <div className="provider-card flex flex-col p-5 gap-4" data-testid={`provider-card-${p.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to={`/provider/${p.slug || p.id}`} className="block">
            <h3 className="font-display tracking-bebas text-xl hover:text-amber transition-colors">{p.name}</h3>
          </Link>
          <p className="text-xs mt-0.5" style={{ color: '#8A8A8A' }}>{p.spec || p.services?.slice(0, 2).join(', ') || 'Универсал'}</p>
        </div>
        <span className={`badge ${p.status === 'open' || !p.status ? '' : 'badge-muted'}`}>{status}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs" style={{ color: '#B8B8B8' }}>
        <span className="flex items-center gap-1"><Star size={12} className="text-amber" fill="currentColor" />{p.ratingAvg ?? '—'} <span style={{ color: '#8A8A8A' }}>({p.reviewsCount ?? 0})</span></span>
        <span className="flex items-center gap-1"><MapPin size={12} className="text-amber" />{p.distanceKm ?? '—'} км</span>
        <span className="flex items-center gap-1"><Clock size={12} className="text-amber" />{p.etaMinutes ?? '—'} мин</span>
      </div>

      <div className="flex flex-wrap gap-1">
        {(p.trustBadges || []).slice(0, 3).map((b: string, i: number) => (
          <span key={i} className="badge badge-muted">{b.toUpperCase()}</span>
        ))}
      </div>

      <div className="hairline-t pt-3 flex items-center justify-between mt-auto">
        <div>
          <div className="text-2xs uppercase tracking-widest" style={{ color: '#8A8A8A' }}>от</div>
          <div className="font-display tracking-bebas text-2xl text-amber leading-none">{p.priceFrom ?? 500} ₴</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onBook} className="btn-primary btn-sm" data-testid={`book-${p.id}`}>
            Записаться
          </button>
          <Link to={`/provider/${p.slug || p.id}`} className="btn-secondary btn-sm" data-testid={`detail-${p.id}`}>
            Профиль
          </Link>
        </div>
      </div>
    </div>
  );
}
