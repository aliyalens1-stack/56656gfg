# Architecture Alignment Baseline — Sprint 1+2 snapshot

> Снимок состояния контрактов **после** завершения Sprint 1 (Contract Firefight) и Sprint 2 (Seed & Security).
> Любое расхождение client ↔ backend должно быть отражено в этом файле.

## Модули и их зоны ответственности

| Layer | Owner | URL prefix | Порт |
|---|---|---|---|
| Mobile Expo | `/app/frontend/` | `/` (root) | 3000 |
| Admin Panel (Vite) | `/app/admin/` → `dist/` | `/api/admin-panel/` | served by FastAPI |
| Web Marketplace (Vite) | `/app/web-app/` → `dist/` | `/api/web-app/` | served by FastAPI |
| FastAPI (orchestration + compat) | `/app/backend/server.py` | `/api/*` native + catch-all proxy | 8001 |
| NestJS (business CRUD) | `/app/backend/src/modules/` | everything proxied via FastAPI | 3001 (internal) |
| MongoDB | local | — | 27017 |

## Contract Compatibility Layer (FastAPI, before catch-all)

| Client call | Handler | Target |
|---|---|---|
| `GET /api/notifications/my` | compat | → NestJS `GET /notifications` |
| `GET /api/favorites/my` | compat | → NestJS `GET /favorites` |
| `GET /api/organizations/search?q=…` | compat | rewrites `q` → `search`, proxies to `GET /organizations` |
| `GET /api/garage/:id` | compat | → NestJS `GET /vehicles/:id` |
| `GET /api/payments/list` | compat | → NestJS `GET /payments/my` |
| `POST /api/slots/reserve` | compat | → NestJS `POST /slots/hold` |
| `POST /api/auth/forgot-password` | native mock-safe | generates reset token, never reveals user existence |
| `POST /api/auth/reset-password` | native | consumes token → update passwordHash |
| `GET /api/admin/live-feed` | native | aggregates `governance_actions` + `orchestrator_logs` |
| `GET /api/admin/alerts` | native | aggregates `failsafe_incidents{status:open}` + zones with `status=CRITICAL` |
| `GET /api/admin/automation/replay` | compat | → NestJS `GET /admin/automation/replay/history` |
| `GET /api/admin/config/features` | compat | → NestJS `GET /admin/feature-flags` |
| `GET/POST /api/admin/config/commission-tiers` | native | CRUD on `platformconfigs{type:"commission_tiers"}` |

## Seed data (demo; idempotent)

| Collection | Count | Owner |
|---|---|---|
| users (admin/customer/provider) | 3 | seed_data |
| organizations | 8 | seed_marketplace_data |
| services | 12 | seed_marketplace_data |
| servicecategories | 8 | seed_marketplace_data |
| reviews | 35 | seed_marketplace_data |
| zones | 6 (+1368 snapshots) | seed_marketplace_data + zone engine |
| provider_availability, provider_performance, provider_skills, provider_locations | 8/8/33/8 | seed_marketplace_data |
| **bookings** | **20** | seed_demo_data |
| **quotes** | **10** | seed_demo_data |
| **vehicles** | **5** | seed_demo_data |
| **favorites** | **5** | seed_demo_data |
| **notifications** | **10** | seed_demo_data |
| **payments (mock)** | **5** | seed_demo_data |
| **disputes** | **3** | seed_demo_data |
| **feature_flags** | **5** | seed_demo_data |
| **audit_logs** | **30** | seed_demo_data |
| Phase E/G/H (orchestrator/feedback/failsafe/…) | 100s | runtime engines |

## Security

- `web-app /provider/*` теперь под `<ProtectedRoute roles={['provider_owner','provider_manager','admin']} />` (ранее был demo-bypass).
- `web-app /account/*` под `<ProtectedRoute roles={['customer']} />`.
- Mobile использует `AuthContext` + axios 401 interceptor → авто-logout.
- Admin использует `authStore` + 401 redirect на `/login`.

## Known remaining work (future sprints)

1. **Sprint 3** — data ownership (Mongo collection dedup: `provider_availability` vs `provideravailabilities`, etc.).
2. **Sprint 4** — Realtime (socket.io-client в web-app/admin, live-feed реально через WS).
3. **Sprint 5** — shared contract module для клиентов, smoke-test CI, observability.

## Smoke test

Запуск: `bash /app/ops/health.sh` — объединяет:
- Базовые URL/auth/engine-проверки
- `smoke-contracts.sh` — 30 URL-контрактов
- `smoke-data-consistency.sh` — 24 collection counts + 12 API responses
- `check-deprecated-collections.sh` — deprecated/ambiguous коллекции

## Sprint 3 — Data Consistency (DONE)

- **Ownership матрица** зафиксирована → `/app/memory/DATA_OWNERSHIP.md`
- **2 legacy пустые коллекции удалены**: `audits`, `geozones` (было 72 → стало 70 коллекций)
- **Ambiguous коллекции** (`provideravailabilities`, `providerlivelocations`, `providerservices`, `providerblockedtimes`) — **НЕ дубли**, отдельные концепты NestJS. Пока пусты, заполнятся при активации соответствующих фич.
- **Migration tool** `/app/ops/migrate-collections.js` с `--dry-run / --apply / --apply-drop`
- **Deprecated-watcher** `/app/ops/check-deprecated-collections.sh`
- **Data-consistency smoke** `/app/ops/smoke-data-consistency.sh` — 24 collection counts + 12 API endpoints
- **health.sh** теперь прогоняет все 3 smoke-теста одной командой

## Sprint 4 — Realtime Alignment (DONE)

- **Backend fix**: gateway path сменён на `/api/socket.io/` (раньше был `/socket.io/` — недоступен через preview URL); emit-роутер различает `zone:*` (global), `booking:*` (global + per-user), `provider:*` (admin+providers), `orchestrator:*`/`alert:*` (admin only).
- **Client**: socket.io-client установлен в `web-app` и `admin`; общий сокет-клиент `src/lib/socket.ts` с auto-reconnect; хуки `useRealtimeSocket.ts`:
  - `useRealtimeStatus()` — live connection state
  - `useRealtimeEvent(event, handler)` — один event
  - `useRealtimeEvents({ev1, ev2}, deps)` — несколько event'ов
- **Интеграция**:
  - `admin/LiveMonitorPage` — подписка на `booking:*`, `booking.*`, `provider.location.updated` → мгновенный refetch + индикатор «Live WS / Fallback poll» в шапке
  - `web-app/MarketplaceHome` — подписка на `zone:updated`, `zone:surge_changed`, `booking:created`, `booking.completed` → live-refresh providers & stats (30s fallback polling сохранён)
  - `web-app/BookingDetailPage` — подписка на `booking:status_changed`, `booking:provider_location`, `booking.confirmed/started/completed/cancelled` → instant tracking update (10s polling заменён на 30s fallback)
- **Transport**: `polling` only (WS upgrade не поддерживается через текущий `/api` proxy httpx; polling работает стабильно через catch-all FastAPI → NestJS).
- **Mobile** — остаётся на SSE-poll `/api/realtime/events` (по ТЗ Sprint 4 не трогаем).
- **Smoke-test** `/app/ops/smoke-realtime.sh` — 3 check: status endpoint, socket.io handshake, end-to-end event delivery через JS клиент.

## Sprint 5 — API Contract Layer (DONE)

- **Single source of truth**: `api-contracts.ts` создан в трёх клиентах, структура идентична:
  - `/app/admin/src/shared/api-contracts.ts`
  - `/app/web-app/src/shared/api-contracts.ts`
  - `/app/frontend/src/shared/api-contracts.ts`
- **Catalogue покрывает 16 доменов**: `auth`, `notifications`, `favorites`, `bookings`, `quotes`, `vehicles`, `garage`, `reviews`, `disputes`, `organizations`, `services`, `marketplace`, `matching`, `slots`, `experiments`, `provider`, `zones`, `demand`, `orchestrator`, `feedback`, `admin`, `realtime`, `health`.
- **services/api.ts обновлены**: все критические группы (`auth`, `notifications`, `favorites`, `bookings`, `vehicles`, `quotes`, `reviews`, `organizations`, `services`, `marketplace`, `matching`, `admin.dashboard/liveFeed/alerts/users/bookings/featureFlags/commissionTiers`, `provider.*`, `zones.*`, `feedback.*`) теперь ссылаются на `API.*` константы.
- **Hardcoded-миграция (status)**:
  - `web-app/src/services/api.ts` — **44 / 63** вызовов через `API.*` (70% converted; остаток — длинные query string URLs пока не вынесены)
  - `frontend/src/services/api.ts` — **41 / 102** (40%)
  - `admin/src/services/api.ts` — **6 / 250** (2% — критические пути: `auth`, `admin.dashboard/liveFeed/alerts/users`; остальное — 244 admin routes, будут мигрированы постепенно без блокировки)
  - **Оставшиеся hardcoded пути безопасны**: они внутри wrapper-функций в services-слое; миграция идёт без ломки UI.
- **Smoke-test**: `/app/ops/smoke-api-contracts.sh` — **42/42** endpoints из contract-каталога возвращают 200 OK.
- **health.sh** теперь прогоняет все 5 smoke-тестов (contracts + data + deprecated + realtime + api-contracts).

## Итоговая матрица smoke-тестов

| Sprint | Script | Что проверяет | Статус |
|---|---|---|---|
| Sprint 1 | `smoke-contracts.sh` | 30 URL-контрактов (compat-layer + base) | ✅ 30/30 |
| Sprint 3 | `smoke-data-consistency.sh` | 24 collection counts + 12 API responses | ✅ 36/36 |
| Sprint 3 | `check-deprecated-collections.sh` | 2 deprecated + 4 ambiguous | ✅ 0 drift |
| Sprint 4 | `smoke-realtime.sh` | socket.io E2E (status + handshake + event delivery) | ✅ 3/3 |
| Sprint 5 | `smoke-api-contracts.sh` | 42 endpoints из contract catalogue | ✅ 42/42 |
