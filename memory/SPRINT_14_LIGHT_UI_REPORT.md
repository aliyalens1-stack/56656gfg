# Sprint 14 — Light UI Migration · Completion Report

> Дата: 2026-04-25 · Статус: **DONE** · Scope: web-app public flow (MarketplaceHome + SearchPage + AppShell)

## Definition of Done — все 8 пунктов ✅

| # | Критерий | Доказательство |
|---|---|---|
| 1 | Весь public web светлый | `index.css` palette: `--bg #f6f7f9`, `--surface #fff`. Tailwind `ink.*` пересмотрен в light grayscale. Все legacy классы (`.card`, `.btn-primary`, `.input-dark`, `.chip`, `.badge`, `.surface`) перекрашены — все 18 страниц web-app автоматически светлые без правок их кода. |
| 2 | Header product-oriented | Sticky white header, hairline border, brand mark + inline search, role-aware nav (guest/customer/provider), `Become provider` как dark CTA, user-menu для авторизованных. Mobile drawer с поисковым полем и role-specific items. |
| 3 | Главная = поиск + провайдеры | `MarketplaceHome.tsx`: hero h1 «Find a mechanic near you» + search box (problem + city + Search) + 7 problem-chips (`won't start`, `tow truck`, `diagnostics`...) + live stats panel (4 KPI + recent activity feed + Quick request CTA) + Recommended grid + How-it-works (3 шага). |
| 4 | Search = filters + cards + optional map | `SearchPage.tsx`: 3-col layout `[filters 260] [results] [map 400]` при `?view=map`, 2-col `[filters][results]` иначе. Filters block: 6 чекбоксов (Open now / Mobile / Rating 4.5+ / Verified / Urgent / Within 5 km) + price slider. Mobile filters в bottom-sheet drawer. URL state: `?view=map`, `?q=`, `?problem=`. |
| 5 | Provider cards читаемые за 3 сек | `ProviderCard.tsx`: 3-зонная сетка `[photo 96][title+meta][price+CTA]`. Сверху: имя + open-badge. Под именем — meta-line (★ rating · distance · ETA). Trust chips (Verified / Mobile / Fast response). Цена справа крупно `from XXX €`. Двойной CTA: yellow Book + outline Profile. |
| 6 | Yellow только как CTA/accent | Yellow используется на: Search button, Book button, brand mark, problem chips hover, eyebrow text (`Auto service marketplace`, `Recommended`), star rating, live-dot для online. **НЕ используется** на фонах, карточках, hero. |
| 7 | No dark landing sections in primary flow | Все hero/cards/footer — белые/light-soft. Чёрный (`#111`) только на: `Become provider` CTA, `Quick request` button, `Map/List` toggle. Это намеренно — продуктовые secondary actions. |
| 8 | Health & e2e green | `vite build` чистый, 0 TS errors. Live URLs 200: `/api/web-app/` (home), `/api/web-app/search` (list), `/api/web-app/search?view=map` (map). API `/api/marketplace/providers` отдаёт 8 провайдеров, `/api/marketplace/stats` живая статистика. |

---

## Что сделано

### 1. Дизайн-токены (`src/index.css`)
Полная переработка корня:
```css
--bg:           #f6f7f9
--surface:      #ffffff
--primary:      #f5b800   (yellow CTA)
--success:      #16a34a
--text:         #111827
--shadow-card:  0 1px 2px + 0 8px 24px rgba(15,23,42, 0.06)
```
- `body` font: `Inter` (вместо Bebas Neue + IBM Plex)
- `h1-h6`: weight 800, letter-spacing -0.01em, **без uppercase**
- 30+ utility-классов (`.btn-primary`, `.btn-secondary`, `.btn-dark`, `.btn-ghost`, `.card`, `.chip`, `.badge`, `.live-dot`, `.input-shell`, `.tab-pill`, `.modal-content`, `.surface`, ...) — все переписаны под light с консистентным focus-ring и shadow-card.

### 2. Tailwind config (`tailwind.config.js`)
- `ink.*` (legacy) пересмотрен в light grayscale → `bg-ink-100` теперь `#f6f7f9`, `text-ink-700` → `#4b5563`
- `amber.*` остался `#f5b800` (canonical)
- `boxShadow.card` / `boxShadow.float` — реальные тени для light-сurface
- `borderRadius.DEFAULT = 10px`

### 3. AppShell (`components/MarketplaceLayout.tsx`)
Полностью переписан:
- White sticky header + hairline border
- Inline search 480px (desktop), бургер с drawer'ом (mobile)
- Role-aware nav: customer показывает `My bookings`, `Garage`; provider — `Requests`, `Current job`, `Earnings`
- Guest: `Log in` link + `Become provider` dark CTA
- Auth-user menu: avatar + dropdown с Logout
- Footer: 4-колонная сетка + `© AutoSearch · Made for Germany 🇩🇪`

### 4. ProviderCard (`components/marketplace/ProviderCard.tsx`)
Новый чистый компонент с graceful fallback'ами на любые поля backend (slug/id/_id, rating/ratingAvg, distance/distanceKm, price/priceFrom, photo/logo, isOnline/status). Trust chips подбираются из `trustBadges`/`tags`/`badges` или auto-fallback. data-testid'ы на все элементы.

### 5. MarketplaceHome (`pages/public/MarketplaceHome.tsx`)
3 секции, светлые:
- Hero (search + problem chips + live stats panel)
- Recommended providers (top 6, grid)
- How it works (3 шага в карточках)

### 6. SearchPage (`pages/public/SearchPage.tsx`)
- URL state: `?q=&view=map&problem=`
- Local filtering + sorting: 5 sort'ов (Recommended/Nearest/Fastest/Cheapest/Top rated)
- 6 filter checkboxes + price slider
- Real Leaflet OSM map с жёлтыми pin'ами (Berlin centre default)
- Mobile filters в bottom-sheet drawer
- Empty state с CTA «Clear filters»

---

## Скриншоты (DoD)

1. **Home (1920px)** — белый фон, h1 «Find a mechanic near you», hero search + chips, live stats panel справа (6 online · 6 min ETA · 4.7 rating · 70 today bookings), recommended grid с провайдерами
2. **Search list (1920px)** — Filters sidebar (6 checkboxes + price slider 50-5000€), 8 providers found, чистые карточки
3. **Search map (1920px)** — 3-col, real OSM Berlin map с жёлтыми pin'ами, sticky filters, провайдеры с meta + CTA

---

## Что НЕ делалось (по решению)

- ❌ Provider page (`ProviderPage.tsx`) — не входит в Sprint 14 scope (только Home + Search + AppShell)
- ❌ Customer/Provider dashboard pages — но они автоматически перекрашены в light через утилитарные классы (`.card`, `.btn-primary`, etc)
- ❌ Auth pages (Login/Register) — отдельный full-screen layout, тоже работает в light благодаря CSS, но визуальный rework — следующий спринт
- ❌ Admin panel (`/api/admin-panel/`) — отдельное приложение, светлая тема нужна отдельно

---

## Следующий шаг

Текущая зона: **public marketplace flow**. Следующие logical зоны для light migration:
1. Provider page (`/provider/:slug`) — booking sheet
2. Customer area (`/account/*`)
3. Provider dashboard (`/provider/*`)
4. Auth screens (`/login`, `/register`)
5. Admin panel (отдельная yarn build)

Когда дашь сигнал — начинаю.
