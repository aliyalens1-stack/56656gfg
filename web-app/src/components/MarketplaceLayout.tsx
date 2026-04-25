import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Search, MapPin, User, Menu, X, Heart, Briefcase, Inbox, DollarSign, TrendingUp, Car, FileText, LogOut } from 'lucide-react';
import { useState, useEffect } from 'react';
import { notificationsAPI } from '../services/api';
import Logo from './Logo';

export default function MarketplaceLayout() {
  const { user, token, logout } = useAuthStore();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [city] = useState('Киев');
  const [unread, setUnread] = useState(0);

  const role = user?.role;
  const isCustomer = role === 'customer';
  const isProvider = role === 'provider_owner' || role === 'provider_manager';

  useEffect(() => {
    if (!token) return;
    notificationsAPI.getUnreadCount().then(r => setUnread(r.data?.count ?? 0)).catch(() => {});
  }, [token]);

  const onSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = (e.currentTarget.elements.namedItem('q') as HTMLInputElement)?.value || '';
    navigate(`/search${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-ink-0 text-white font-body">
      {/* ============================ APP HEADER (role-aware product shell) ============================ */}
      <header className="sticky top-0 z-40 bg-black/95 backdrop-blur-md hairline-b">
        <div className="max-w-[1600px] mx-auto px-4 lg:px-8 h-[104px] flex items-center gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center shrink-0" data-testid="nav-logo">
            <Logo height={80} />
          </Link>

          {/* Search bar — always visible */}
          <form onSubmit={onSearchSubmit} className="flex-1 hidden md:block max-w-2xl" data-testid="header-search-form">
            <div className="input-shell">
              <Search size={16} className="text-amber" />
              <input
                name="q"
                type="text"
                placeholder="Услуга, СТО, проблема (напр. диагностика)"
                data-testid="header-search-input"
                className="text-sm"
              />
              <span className="hairline-l hidden md:flex items-center gap-1 pl-3 text-2xs uppercase tracking-widest" style={{ color: '#8A8A8A', borderLeft: '1px solid #2E2E2E', paddingLeft: 12 }}>
                <MapPin size={12} className="text-amber" /> {city}
              </span>
            </div>
          </form>

          {/* Role-aware nav cluster */}
          <nav className="hidden lg:flex items-center gap-1 shrink-0">
            {!token && <NavItem to="/search" icon={Search} label="Поиск" testId="nav-search" />}
            <NavItem to="/search?view=map" icon={MapPin} label="Карта" testId="nav-map" />

            {isCustomer && <>
              <NavItem to="/account/bookings" icon={FileText} label="Заказы" testId="nav-bookings" />
              <NavItem to="/account/garage" icon={Car} label="Гараж" testId="nav-garage" />
              <NavItem to="/account/favorites" icon={Heart} label="Избранное" testId="nav-favorites" />
            </>}

            {isProvider && <>
              <NavItem to="/provider/inbox" icon={Inbox} label="Заявки" testId="nav-inbox" badge={unread} />
              <NavItem to="/provider/current-job" icon={Briefcase} label="Текущий" testId="nav-current" />
              <NavItem to="/provider/earnings" icon={DollarSign} label="Доход" testId="nav-earnings" />
              <NavItem to="/provider/demand" icon={TrendingUp} label="Спрос" testId="nav-demand" />
            </>}
          </nav>

          {/* Right cluster */}
          <div className="flex items-center gap-2 shrink-0 ml-auto lg:ml-0">
            {token && user ? (
              <>
                <Link
                  to={isProvider ? '/provider/profile' : '/account/profile'}
                  className="hidden md:flex items-center gap-2 px-2.5 h-9 surface-chip hover:border-amber transition-colors"
                  data-testid="header-profile"
                >
                  <span className="w-6 h-6 bg-amber flex items-center justify-center text-black font-display text-sm" style={{ borderRadius: 999 }}>
                    {(user.firstName || user.email || '?').charAt(0).toUpperCase()}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-widest hidden xl:block max-w-[120px] truncate">
                    {user.firstName || user.email}
                  </span>
                </Link>
                <button
                  onClick={() => { logout(); navigate('/'); }}
                  className="hidden md:flex w-9 h-9 items-center justify-center surface-chip hover:border-amber transition-colors"
                  style={{ borderRadius: 8 }}
                  title="Выйти"
                  data-testid="header-logout"
                >
                  <LogOut size={14} className="text-amber" />
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-ghost btn-sm hidden sm:inline-flex" data-testid="nav-login">Войти</Link>
                <Link to="/provider/onboarding" className="btn-primary btn-sm" data-testid="nav-cta">Стать мастером</Link>
              </>
            )}

            {/* Mobile toggle */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden w-9 h-9 flex items-center justify-center surface-chip text-amber"
              style={{ borderRadius: 8 }}
              data-testid="nav-mobile-toggle"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile search */}
        {mobileOpen && (
          <div className="lg:hidden bg-ink-0 px-4 pb-4 pt-2 hairline-t space-y-3">
            <form onSubmit={onSearchSubmit}>
              <div className="input-shell">
                <Search size={16} className="text-amber" />
                <input name="q" type="text" placeholder="Услуга, СТО, проблема" className="text-sm" />
              </div>
            </form>
            <div className="grid grid-cols-2 gap-2">
              <NavMobile to="/search" icon={Search} label="Поиск" close={() => setMobileOpen(false)} />
              <NavMobile to="/search?view=map" icon={MapPin} label="Карта" close={() => setMobileOpen(false)} />
              {isCustomer && <>
                <NavMobile to="/account/bookings" icon={FileText} label="Заказы" close={() => setMobileOpen(false)} />
                <NavMobile to="/account/garage" icon={Car} label="Гараж" close={() => setMobileOpen(false)} />
                <NavMobile to="/account/favorites" icon={Heart} label="Избранное" close={() => setMobileOpen(false)} />
                <NavMobile to="/account/profile" icon={User} label="Профиль" close={() => setMobileOpen(false)} />
              </>}
              {isProvider && <>
                <NavMobile to="/provider/inbox" icon={Inbox} label="Заявки" close={() => setMobileOpen(false)} />
                <NavMobile to="/provider/current-job" icon={Briefcase} label="Текущий" close={() => setMobileOpen(false)} />
                <NavMobile to="/provider/earnings" icon={DollarSign} label="Доход" close={() => setMobileOpen(false)} />
                <NavMobile to="/provider/demand" icon={TrendingUp} label="Спрос" close={() => setMobileOpen(false)} />
                <NavMobile to="/provider/profile" icon={User} label="Профиль" close={() => setMobileOpen(false)} />
              </>}
              {!token && <>
                <NavMobile to="/login" icon={User} label="Войти" close={() => setMobileOpen(false)} />
                <NavMobile to="/register" icon={User} label="Регистрация" close={() => setMobileOpen(false)} />
              </>}
            </div>
            {token && (
              <button
                onClick={() => { logout(); navigate('/'); setMobileOpen(false); }}
                className="btn-secondary w-full"
              >Выйти</button>
            )}
          </div>
        )}
      </header>

      <main><Outlet /></main>

      {/* ============================ MINIMAL FOOTER ============================ */}
      <footer className="mt-20 bg-black hairline-t">
        <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-xs">
          <div className="flex items-center gap-3 text-text-3" style={{ color: '#8A8A8A' }}>
            <Logo height={80} />
            <span>· © 2026</span>
          </div>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link to="/search" className="hover:text-amber transition-colors" style={{ color: '#B8B8B8' }}>Каталог</Link>
            <Link to="/search?view=map" className="hover:text-amber transition-colors" style={{ color: '#B8B8B8' }}>Карта</Link>
            <Link to="/register" className="hover:text-amber transition-colors" style={{ color: '#B8B8B8' }}>Для мастеров</Link>
            <Link to="/about" className="hover:text-amber transition-colors" style={{ color: '#B8B8B8' }}>О сервисе</Link>
            <a href="mailto:support@autosearch.ua" className="hover:text-amber transition-colors" style={{ color: '#B8B8B8' }}>Поддержка</a>
            <a href="#" className="hover:text-amber transition-colors" style={{ color: '#B8B8B8' }}>Условия</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function NavItem({ to, icon: Icon, label, testId, badge }: { to: string; icon: any; label: string; testId: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex items-center gap-2 px-3 h-9 text-xs uppercase tracking-widest font-semibold transition-colors ${
          isActive ? 'text-amber' : 'text-white/85 hover:text-amber'
        }`
      }
      style={{ borderRadius: 8 }}
      data-testid={testId}
    >
      <Icon size={14} />
      <span>{label}</span>
      {badge && badge > 0 ? (
        <span className="ml-1 min-w-[18px] h-[18px] px-1.5 bg-amber text-black text-2xs font-bold flex items-center justify-center" style={{ borderRadius: 999 }}>
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </NavLink>
  );
}

function NavMobile({ to, icon: Icon, label, close }: { to: string; icon: any; label: string; close: () => void }) {
  return (
    <NavLink
      to={to}
      end
      onClick={close}
      className={({ isActive }) =>
        `flex items-center gap-2 px-3 h-11 text-xs uppercase tracking-widest font-semibold transition-colors surface-chip ${
          isActive ? '!border-amber text-amber' : 'text-white hover:text-amber'
        }`
      }
    >
      <Icon size={14} className="text-amber" />
      <span>{label}</span>
    </NavLink>
  );
}
