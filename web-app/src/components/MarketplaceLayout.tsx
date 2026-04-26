import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Search, Bell, LogOut, Menu, X, MapPin, Heart, Briefcase, Inbox, DollarSign, TrendingUp, Car, FileText } from 'lucide-react';
import { useState, useEffect, ReactNode } from 'react';
import { notificationsAPI } from '../services/api';

/**
 * Sprint 14 — Light AppShell
 * - White header with sticky scroll, hairline border
 * - Search inline (desktop) + mobile drawer
 * - Role-aware nav (guest / customer / provider)
 * - Yellow only as CTA (Become provider) or accent on active link
 */
export default function MarketplaceLayout() {
  const { user, token, logout } = useAuthStore();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const role = user?.role;
  const isCustomer = role === 'customer';
  const isProvider = role === 'provider_owner' || role === 'provider_manager';
  const isGuest = !user;

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
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* ─── HEADER ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 md:px-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0" data-testid="brand-link">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)] text-black font-black text-lg">A</div>
            <span className="text-base font-extrabold tracking-tight text-[var(--text)] hidden sm:block">AutoSearch</span>
          </Link>

          {/* Search inline (desktop) */}
          <form onSubmit={onSearchSubmit} className="hidden md:flex flex-1 max-w-lg">
            <div className="flex items-center w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 h-10 focus-within:border-[var(--primary)] focus-within:bg-white">
              <Search size={16} className="text-[var(--text-soft)] shrink-0" />
              <input
                name="q"
                placeholder="Service, workshop, problem…"
                className="ml-2 w-full bg-transparent text-sm outline-none placeholder:text-[var(--text-soft)]"
                data-testid="header-search-input"
              />
            </div>
          </form>

          {/* Nav (desktop) */}
          <nav className="ml-auto hidden md:flex items-center gap-1">
            <NavItem to="/search" testId="nav-search">Search</NavItem>
            <NavItem to="/search?view=map" testId="nav-map">Map</NavItem>

            {isCustomer && (
              <>
                <NavItem to="/account/bookings" testId="nav-bookings">My bookings</NavItem>
                <NavItem to="/account/garage" testId="nav-garage">Garage</NavItem>
              </>
            )}

            {isProvider && (
              <>
                <NavItem to="/provider/inbox" testId="nav-prov-inbox">Requests</NavItem>
                <NavItem to="/provider/current-job" testId="nav-prov-current">Current job</NavItem>
                <NavItem to="/provider/earnings" testId="nav-prov-earn">Earnings</NavItem>
              </>
            )}

            {isGuest ? (
              <>
                <Link to="/login" className="nav-link" data-testid="nav-login">Log in</Link>
                <Link
                  to="/provider/onboarding"
                  className="ml-2 inline-flex items-center rounded-xl bg-[#111] px-4 py-2 text-sm font-bold text-white hover:bg-[#1f2937]"
                  data-testid="nav-become-provider"
                >
                  Become provider
                </Link>
              </>
            ) : (
              <UserMenu user={user} unread={unread} onLogout={() => { logout(); navigate('/'); }} />
            )}
          </nav>

          {/* Mobile burger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden ml-auto inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-white h-10 w-10"
            data-testid="header-burger"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
        </div>
      </header>

      {/* ─── MOBILE DRAWER ─────────────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" data-testid="mobile-drawer">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-80 max-w-[88vw] bg-white border-l border-[var(--border)] flex flex-col">
            <div className="h-16 flex items-center justify-between px-5 border-b border-[var(--border)]">
              <span className="font-bold">Menu</span>
              <button onClick={() => setMobileOpen(false)} className="h-9 w-9 rounded-lg hover:bg-[var(--surface-soft)] flex items-center justify-center" aria-label="Close menu"><X size={18} /></button>
            </div>
            <form onSubmit={onSearchSubmit} className="px-4 pt-4">
              <div className="input-shell">
                <Search size={16} className="text-[var(--text-soft)]" />
                <input name="q" placeholder="Service, workshop, problem…" />
              </div>
            </form>
            <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-0.5">
              <DrawerItem to="/search" onClick={() => setMobileOpen(false)} icon={<Search size={16} />}>Search</DrawerItem>
              <DrawerItem to="/search?view=map" onClick={() => setMobileOpen(false)} icon={<MapPin size={16} />}>Map</DrawerItem>
              {isCustomer && <>
                <DrawerItem to="/account/bookings" onClick={() => setMobileOpen(false)} icon={<FileText size={16} />}>My bookings</DrawerItem>
                <DrawerItem to="/account/garage" onClick={() => setMobileOpen(false)} icon={<Car size={16} />}>Garage</DrawerItem>
                <DrawerItem to="/account/favorites" onClick={() => setMobileOpen(false)} icon={<Heart size={16} />}>Favorites</DrawerItem>
                <DrawerItem to="/account/profile" onClick={() => setMobileOpen(false)} icon={<Bell size={16} />}>Profile {unread > 0 && <span className="ml-auto text-xs bg-[var(--primary)] text-black rounded-full px-2 py-0.5 font-bold">{unread}</span>}</DrawerItem>
              </>}
              {isProvider && <>
                <DrawerItem to="/provider/inbox" onClick={() => setMobileOpen(false)} icon={<Inbox size={16} />}>Requests</DrawerItem>
                <DrawerItem to="/provider/current-job" onClick={() => setMobileOpen(false)} icon={<Briefcase size={16} />}>Current job</DrawerItem>
                <DrawerItem to="/provider/earnings" onClick={() => setMobileOpen(false)} icon={<DollarSign size={16} />}>Earnings</DrawerItem>
                <DrawerItem to="/provider/demand" onClick={() => setMobileOpen(false)} icon={<TrendingUp size={16} />}>Demand</DrawerItem>
              </>}
            </nav>
            <div className="border-t border-[var(--border)] p-4">
              {isGuest ? (
                <div className="space-y-2">
                  <Link to="/login" onClick={() => setMobileOpen(false)} className="btn-secondary w-full" data-testid="drawer-login">Log in</Link>
                  <Link to="/provider/onboarding" onClick={() => setMobileOpen(false)} className="btn-dark w-full" data-testid="drawer-become-provider">Become provider</Link>
                </div>
              ) : (
                <button
                  onClick={() => { logout(); setMobileOpen(false); navigate('/'); }}
                  className="btn-secondary w-full inline-flex items-center justify-center gap-2"
                  data-testid="drawer-logout"
                >
                  <LogOut size={16} /> Log out
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      <main>
        <Outlet />
      </main>

      {/* ─── FOOTER ─────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border)] bg-white mt-16">
        <div className="mx-auto max-w-7xl px-4 py-10 grid gap-8 md:grid-cols-4 text-sm">
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)] text-black font-black">A</div>
              <span className="font-extrabold">AutoSearch</span>
            </div>
            <p className="text-[var(--text-2)] max-w-xs">Auto service marketplace. Trusted workshops & mobile mechanics in your city.</p>
          </div>
          <FooterCol title="For customers" links={[['Search', '/search'], ['How it works', '#'], ['Pricing', '#']]} />
          <FooterCol title="For providers" links={[['Become provider', '/provider/onboarding'], ['Pricing', '#'], ['Help', '#']]} />
          <FooterCol title="Company" links={[['About', '#'], ['Contact', '#'], ['Legal', '#']]} />
        </div>
        <div className="border-t border-[var(--border)]">
          <div className="mx-auto max-w-7xl px-4 py-4 text-xs text-[var(--text-soft)] flex flex-wrap items-center justify-between gap-2">
            <span>© {new Date().getFullYear()} AutoSearch. All rights reserved.</span>
            <span>Made for Germany 🇩🇪</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function NavItem({ to, children, testId }: { to: string; children: ReactNode; testId?: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        [
          'rounded-xl px-3 py-2 text-sm font-semibold transition',
          isActive
            ? 'bg-[var(--primary-soft)] text-[var(--text)]'
            : 'text-[var(--text-2)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]',
        ].join(' ')
      }
      data-testid={testId}
    >
      {children}
    </NavLink>
  );
}

function DrawerItem({ to, children, icon, onClick }: { to: string; children: ReactNode; icon?: ReactNode; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold',
          isActive
            ? 'bg-[var(--primary-soft)] text-[var(--text)]'
            : 'text-[var(--text-2)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]',
        ].join(' ')
      }
    >
      {icon}
      {children}
    </NavLink>
  );
}

function UserMenu({ user, unread, onLogout }: { user: any; unread: number; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const initials = (user?.firstName?.[0] || user?.email?.[0] || 'U').toUpperCase();
  return (
    <div className="relative ml-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-2 py-1.5 hover:bg-[var(--surface-soft)]"
        data-testid="user-menu-button"
      >
        <div className="h-7 w-7 rounded-lg bg-[var(--primary)] text-black font-bold flex items-center justify-center text-sm">{initials}</div>
        {unread > 0 && <span className="text-xs bg-[var(--danger)] text-white rounded-full px-1.5 py-0.5 font-bold">{unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-[var(--border)] bg-white p-2 shadow-[var(--shadow-float)] z-20">
            <div className="px-3 py-2 border-b border-[var(--border)] mb-1">
              <div className="text-sm font-semibold truncate">{user?.firstName || user?.email}</div>
              <div className="text-xs text-[var(--text-soft)] truncate">{user?.email}</div>
            </div>
            <Link to="/account/profile" className="flex px-3 py-2 rounded-lg text-sm hover:bg-[var(--surface-soft)]" onClick={() => setOpen(false)}>Profile</Link>
            {user?.role === 'customer' && <Link to="/account/bookings" className="flex px-3 py-2 rounded-lg text-sm hover:bg-[var(--surface-soft)]" onClick={() => setOpen(false)}>My bookings</Link>}
            {(user?.role === 'provider_owner' || user?.role === 'provider_manager') && <Link to="/provider" className="flex px-3 py-2 rounded-lg text-sm hover:bg-[var(--surface-soft)]" onClick={() => setOpen(false)}>Dashboard</Link>}
            <button onClick={onLogout} className="w-full text-left px-3 py-2 rounded-lg text-sm text-[var(--danger)] hover:bg-[var(--danger-soft)] flex items-center gap-2" data-testid="user-menu-logout"><LogOut size={14} /> Log out</button>
          </div>
        </>
      )}
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="font-bold mb-3">{title}</div>
      <ul className="space-y-2 text-[var(--text-2)]">
        {links.map(([label, href]) => (
          <li key={label}><Link to={href} className="hover:text-[var(--text)]">{label}</Link></li>
        ))}
      </ul>
    </div>
  );
}
