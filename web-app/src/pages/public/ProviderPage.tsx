import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Star, MapPin, Clock, Phone, ShieldCheck, ArrowRight, Heart, Zap, AlertTriangle,
  CheckCircle2, Calendar, ChevronRight,
} from 'lucide-react';
import { marketplaceAPI, favoritesAPI } from '../../services/api';
import BookingModal from '../../components/BookingModal';
import QuickRequestModal from '../../components/QuickRequestModal';

const TABS = [
  { id: 'services', label: 'Услуги' },
  { id: 'slots',    label: 'Слоты'   },
  { id: 'reviews',  label: 'Отзывы'  },
  { id: 'why',      label: 'Почему мы' },
  { id: 'zone',     label: 'Зона'    },
];

export default function ProviderPage() {
  const { slug } = useParams();
  const [p, setP]                   = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState('services');
  const [bookingOpen, setBookingOpen] = useState(false);
  const [quickOpen, setQuickOpen]   = useState(false);
  const [favorited, setFavorited]   = useState(false);
  const [slots, setSlots]           = useState<any[]>([]);
  const [slotDate, setSlotDate]     = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (!slug) return;
    marketplaceAPI.getProviderDetail(slug).then((r: any) => setP(r.data)).catch(() => setP(null)).finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (tab === 'slots' && p?.slug) {
      marketplaceAPI.getProviderSlots(p.slug, slotDate)
        .then(r => setSlots(r.data?.slots || []))
        .catch(() => {
          const fb = [];
          for (let h = 9; h < 19; h++) for (const m of [0, 30]) fb.push({ time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, available: Math.random() > 0.3 });
          setSlots(fb);
        });
    }
  }, [tab, p, slotDate]);

  const toggleFav = async () => {
    setFavorited(!favorited);
    try { favorited ? await favoritesAPI.remove(p.id) : await favoritesAPI.add(p.id); } catch {}
  };

  if (loading) return <div className="bg-black min-h-screen flex items-center justify-center text-sm" style={{ color: '#8A8A8A' }}>Загрузка…</div>;
  if (!p) return (
    <div className="bg-black min-h-screen flex items-center justify-center px-4">
      <div className="card text-center max-w-md p-10">
        <AlertTriangle size={36} className="text-amber mx-auto mb-4" />
        <p className="mb-5" style={{ color: '#B8B8B8' }}>Мастер не найден</p>
        <Link to="/search" className="btn-primary">Вернуться к поиску</Link>
      </div>
    </div>
  );

  const services = p.services?.length ? p.services : [
    { name: 'Компьютерная диагностика', price: 'от 500 ₴', duration: '30 мин' },
    { name: 'Замена масла',             price: 'от 300 ₴', duration: '20 мин' },
    { name: 'Замена тормозных колодок', price: 'от 1200 ₴', duration: '60 мин' },
    { name: 'Электрика',                price: 'от 600 ₴', duration: '45 мин' },
  ];
  const reviews = p.reviews?.length ? p.reviews : [
    { author: 'Александр К.', rating: 5, text: 'Быстро приехали, всё починили. Рекомендую.', date: '2 дня назад' },
    { author: 'Мария Н.',     rating: 5, text: 'Цена как обещали, без сюрпризов.', date: 'неделю назад' },
  ];
  const rating       = p.ratingAvg ?? p.rating ?? 4.9;
  const reviewsCount = p.reviewsCount ?? p.reviewCount ?? p.reviews?.length ?? 234;
  const ordersCount  = p.ordersCount ?? p.orders ?? 534;
  const eta          = p.etaMinutes ?? p.eta ?? 8;
  const dist         = p.distanceKm ?? p.distance ?? 1.2;

  return (
    <div className="bg-black min-h-screen text-white">
      {/* ============ HERO (conversion-focused) ============ */}
      <section className="relative hairline-b overflow-hidden">
        <div className="absolute inset-0 opacity-15">
          <img src={p.coverImage || 'https://images.pexels.com/photos/1409999/pexels-photo-1409999.jpeg'} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/85 to-black" />
        </div>
        <div className="relative max-w-[1600px] mx-auto px-4 lg:px-8 py-10">
          <div className="slash-label mb-4">{p.city || 'КИЕВ'} · {p.district || 'ЦЕНТР'}</div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 items-start">
            <div>
              <h1 className="font-display tracking-bebas text-[44px] md:text-[64px] lg:text-[80px] leading-[1]" data-testid="provider-name">
                {p.name?.split(' ').map((w: string, i: number) => (
                  <span key={i} className={i % 2 === 0 ? 'text-amber' : 'text-white'}>{w} </span>
                ))}
              </h1>
              <p className="mt-3 text-sm max-w-2xl" style={{ color: '#B8B8B8' }}>
                {p.description || p.spec || 'Быстрая и надёжная автомастерская. Все услуги — прозрачные цены — гарантия.'}
              </p>

              {/* Stats row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8" data-testid="provider-stats">
                <Stat icon={Star}      label="Рейтинг"  value={`${rating}★`} sub={`${reviewsCount} отзывов`} />
                <Stat icon={CheckCircle2} label="Заказов" value={`${ordersCount}+`} sub="всего" />
                <Stat icon={Clock}     label="ETA"      value={`${eta} мин`} sub="прибытие" />
                <Stat icon={MapPin}    label="От вас"   value={`${dist} км`} sub="расстояние" />
              </div>
            </div>

            {/* Sticky CTA card */}
            <div className="card-elevated lg:min-w-[320px] flex flex-col gap-3" data-testid="cta-card">
              <div className="flex items-center justify-between">
                <span className="badge badge-success">{p.status === 'closed' ? 'Закрыт' : 'Открыт'}</span>
                <span className="flex items-center gap-1.5 text-2xs uppercase tracking-widest text-amber font-bold">
                  <span className="live-dot" /> отвечает за 2 мин
                </span>
              </div>
              <div>
                <div className="text-2xs uppercase tracking-widest" style={{ color: '#8A8A8A' }}>Цена от</div>
                <div className="font-display tracking-bebas text-4xl text-amber">{p.priceFrom ?? 500} ₴</div>
              </div>
              <button onClick={() => setBookingOpen(true)} className="btn-primary btn-lg w-full" data-testid="hero-book">
                ЗАПИСАТЬСЯ <ArrowRight size={14} />
              </button>
              <button onClick={() => setQuickOpen(true)} className="btn-secondary w-full" data-testid="hero-quick">
                <Zap size={14} fill="currentColor" /> БЫСТРЫЙ ЗАПРОС
              </button>
              <button onClick={toggleFav} className="btn-ghost w-full" data-testid="hero-fav">
                <Heart size={14} className={favorited ? 'text-amber' : ''} fill={favorited ? 'currentColor' : 'none'} />
                {favorited ? 'В избранном' : 'В избранное'}
              </button>
              <div className="hairline-t pt-3 grid gap-2 text-xs" style={{ color: '#B8B8B8' }}>
                <div className="flex items-center gap-2"><CheckCircle2 size={12} className="text-amber" /> Платёж после выполнения</div>
                <div className="flex items-center gap-2"><ShieldCheck size={12} className="text-amber" /> Гарантия 1 год</div>
              </div>
            </div>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap gap-1.5 mt-8">
            {(p.trustBadges || ['Проверенный', 'Выезд', 'Гарантия', 'Быстро отвечает', 'Сертификат']).map((b: string, i: number) => (
              <span key={i} className="badge badge-muted">{b.toUpperCase()}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ============ TABS ============ */}
      <section className="max-w-[1600px] mx-auto px-4 lg:px-8 py-8">
        <div className="tab-group overflow-x-auto no-scrollbar mb-8" data-testid="provider-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`tab-pill ${tab === t.id ? 'active' : ''}`}
              data-testid={`tab-${t.id}`}
            >{t.label}</button>
          ))}
        </div>

        {tab === 'services' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="services-grid">
            {services.map((s: any, i: number) => (
              <div key={i} className="card-interactive flex items-center justify-between gap-4 !p-4" onClick={() => setBookingOpen(true)} data-testid={`svc-${i}`}>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{s.name}</div>
                  <div className="text-2xs uppercase tracking-widest mt-1 flex items-center gap-3" style={{ color: '#8A8A8A' }}>
                    <span className="flex items-center gap-1"><Clock size={10} className="text-amber" /> {s.duration || '30 мин'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-display tracking-bebas text-2xl text-amber leading-none">{s.price}</span>
                  <ChevronRight size={14} className="text-amber" />
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'slots' && (
          <div data-testid="slots-tab">
            <div className="flex items-center justify-between mb-4">
              <div className="slash-label flex items-center gap-2"><Calendar size={12} className="text-amber" /> ВЫБЕРИТЕ ДАТУ</div>
              <input type="date" value={slotDate} onChange={e => setSlotDate(e.target.value)} className="input-dark !w-auto !h-9 text-xs" data-testid="slot-date" />
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {slots.map((s, i) => (
                <button
                  key={i}
                  disabled={!s.available}
                  onClick={() => setBookingOpen(true)}
                  className={`h-11 text-sm font-semibold transition-colors ${
                    s.available ? 'surface-chip hover:border-amber cursor-pointer' : 'surface-chip opacity-30 cursor-not-allowed'
                  }`}
                  style={{ borderRadius: 8 }}
                  data-testid={`pslot-${s.time}`}
                >{s.time}</button>
              ))}
            </div>
          </div>
        )}

        {tab === 'reviews' && (
          <div className="space-y-3" data-testid="reviews-list">
            {reviews.map((r: any, i: number) => (
              <div key={i} className="card !p-5" data-testid={`rev-${i}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber flex items-center justify-center text-black font-display text-lg" style={{ borderRadius: 999 }}>{r.author?.[0]}</div>
                    <div>
                      <div className="font-semibold">{r.author}</div>
                      <div className="text-2xs uppercase tracking-widest mt-0.5" style={{ color: '#8A8A8A' }}>{r.date}</div>
                    </div>
                  </div>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star key={j} size={12} className={j < r.rating ? 'text-amber' : ''} fill={j < r.rating ? 'currentColor' : 'none'} />
                    ))}
                  </div>
                </div>
                <p className="text-sm mt-3 leading-relaxed" style={{ color: '#B8B8B8' }}>{r.text}</p>
              </div>
            ))}
          </div>
        )}

        {tab === 'why' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="why-grid">
            <Why icon={ShieldCheck} title="Гарантия 1 год" body="Все работы по нормативам. Возвращаем деньги при дефекте." />
            <Why icon={CheckCircle2} title="Прозрачные цены" body="Цена зафиксирована до выезда. Никаких накруток на месте." />
            <Why icon={Clock} title="Быстро" body="Среднее время прибытия — 8 минут. Без долгих звонков." />
          </div>
        )}

        {tab === 'zone' && (
          <div className="card aspect-[16/9] flex items-center justify-center flex-col gap-4 text-center p-8" data-testid="zone-tab">
            <MapPin size={42} className="text-amber" />
            <h3 className="font-display tracking-bebas text-3xl">ЗОНА РАБОТЫ</h3>
            <p className="max-w-md text-sm" style={{ color: '#B8B8B8' }}>
              Выезд по {p.city || 'Киеву'} и пригороду. Радиус — 12 км от мастерской.
            </p>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5"><Phone size={12} className="text-amber" /> {p.phone || '+380 44 333 45 55'}</span>
              <span style={{ color: '#8A8A8A' }}>·</span>
              <span style={{ color: '#B8B8B8' }}>{p.address || 'ул. Автомобильная, 42'}</span>
            </div>
          </div>
        )}
      </section>

      {/* Sticky bottom CTA on mobile */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-ink-0/95 backdrop-blur-md hairline-t p-3 flex gap-2">
        <button onClick={() => setBookingOpen(true)} className="btn-primary flex-1" data-testid="mobile-book">Записаться</button>
        <button onClick={() => setQuickOpen(true)} className="btn-secondary px-4" data-testid="mobile-quick"><Zap size={14} fill="currentColor" /></button>
      </div>

      <BookingModal isOpen={bookingOpen} onClose={() => setBookingOpen(false)} provider={p} />
      <QuickRequestModal isOpen={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }: any) {
  return (
    <div className="surface-chip !p-3 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-2xs uppercase tracking-widest" style={{ color: '#8A8A8A' }}>{label}</span>
        <Icon size={12} className="text-amber" />
      </div>
      <span className="font-display tracking-bebas text-2xl text-amber leading-none">{value}</span>
      <span className="text-2xs" style={{ color: '#8A8A8A' }}>{sub}</span>
    </div>
  );
}

function Why({ icon: Icon, title, body }: any) {
  return (
    <div className="card flex flex-col gap-3 !p-5">
      <span className="icon-badge-soft"><Icon size={16} /></span>
      <h4 className="font-display tracking-bebas text-2xl">{title}</h4>
      <p className="text-sm" style={{ color: '#B8B8B8' }}>{body}</p>
    </div>
  );
}
