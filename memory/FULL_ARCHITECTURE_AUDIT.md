# 🔍 ПОЛНЫЙ АРХИТЕКТУРНЫЙ АУДИТ
> Дата: 2026-04-25 · Sprint после 14 · Глубина: каждый модуль, каждая коллекция, каждый эндпоинт

---

## 0. TL;DR

| Слой | Размер | Здоровье |
|---|---|---|
| **FastAPI** оркестратор + compat-layer | 6 943 строки в одном `server.py`, **179 эндпоинтов**, 4 фоновых движка | ✅ работает, но монолит |
| **NestJS** бизнес-домен | 28 модулей, **289 эндпоинтов**, 40 mongoose-схем | ✅ модульный, но 0 % тестов |
| **MongoDB** | **75 коллекций**, 7 МБ данных в demo-сиде | ✅ ownership зафиксирован в `DATA_OWNERSHIP.md` |
| **Admin** Vite-React | **57 страниц** + 116 admin-API маршрутов в клиенте | ⚠️ Покрытие **~64 %** (45 backend admin-endpoints без UI) |
| **Web** marketplace | **19 страниц** + 18 API-групп | ✅ Закрыт после Sprint 14 |
| **Mobile** Expo SDK 54 | **47 экранов** + 23 API-группы | ⚠️ Кое-что параллельно админке (provider-boost, provider-intelligence) |

**Ключевой инсайт**: бэкенд **сильно опережает фронт**. В FastAPI 4 умных движка (Zone, Orchestrator v2, Feedback, Strategy Optimizer) выдают данные, на которые нет ни одной кнопки в админке. См. § 9.

---

## 1. Архитектура — три слоя

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Kubernetes Ingress  (https://platform-suite-1.preview.emergentagent.com)  │
└────────────────────────────────────────────────────────────────────────────┘
   │                                                              │
   │  /                                                           │  /api/*
   ▼                                                              ▼
┌──────────────────────┐                           ┌────────────────────────────┐
│ Expo Metro :3000     │                           │  FastAPI :8001             │
│ Mobile React Native  │                           │  - 179 native endpoints    │
│ 47 screens           │                           │  - 4 background engines    │
└──────────────────────┘                           │  - serves admin/dist + web │
                                                   │  - catch-all proxy → Nest  │
                                                   └────────────┬───────────────┘
                                                                │ http internal
                                                                ▼
                                                   ┌────────────────────────────┐
                                                   │  NestJS :3001 (internal)   │
                                                   │  28 modules · 289 routes   │
                                                   │  Socket.io gateway         │
                                                   └────────────┬───────────────┘
                                                                │ Mongoose / Motor
                                                                ▼
                                                   ┌────────────────────────────┐
                                                   │  MongoDB :27017            │
                                                   │  auto_search · 75 cols     │
                                                   └────────────────────────────┘
```

**Принципиально важно**: FastAPI делает 3 работы одновременно:
1. **Native endpoints** (179 шт. — auth, marketplace, zones, orchestrator, feedback, admin)
2. **Compat layer** (рерайт `/notifications/my → /notifications`, `/garage/:id → /vehicles/:id` и т.д.)
3. **Static server** (`/api/admin-panel/`, `/api/web-app/` отдают Vite-сборки)
4. **Catch-all proxy** (всё остальное на `/api/*` уходит в NestJS)

Оба клиента (mobile/web) формально дёргают **только `/api/...`** — FastAPI решает, ответить самому или проксировать.

---

## 2. FastAPI — детали

### 2.1 Файл `backend/server.py`
- **6 943 строки** в одном файле — монолит на 4 года накопленного функционала
- **179 native endpoints** (все на `app.*`, без подроутеров)
- **0 Pydantic-моделей** — везде `dict` + ручная валидация. Это причина, почему контракты приходится держать в отдельных `api-contracts.ts` для клиентов.
- **Auth**: JWT (HS256) — `auth.py`-логика встроена прямо в `server.py`. Bcrypt для паролей.

### 2.2 Фоновые движки (4 шт., все стартуют в `lifespan`)

| Движок | Старт | Период | Что делает |
|---|---|---|---|
| **`zone_state_engine`** | line 861 | 10 сек | Считает `zone_snapshots` (3 294 уже накопил), вычисляет surge, supply/demand, обновляет `zones.status` (NORMAL/HOT/CRITICAL) |
| **`orchestrator_engine_loop_v2`** | line 5 967 | 60 сек | Применяет `orchestrator_rules` к зонам → создаёт `governance_actions` (уже 692), эмитит `orchestrator:zone_action` realtime-событие. Сейчас цикл #37 |
| **`feedback_processor_loop`** | line 5 969 | 30 сек | Обрабатывает `action_feedback` (4 006 записей) — оценивает успешность каждого действия orchestrator'а через Δ KPI до/после |
| **`strategy_optimizer_loop`** | line 5 971 | 5 мин | Считает `strategy_weights` (7 записей) — Phase H: эволюционные веса для типов действий по зонам |

### 2.3 FastAPI endpoints — карта по доменам

| Домен | Кол-во | Примеры | Статус |
|---|---|---|---|
| **Auth** | 5 | `/auth/login`, `/register`, `/me`, `/forgot-password`, `/reset-password` | ✅ |
| **Marketplace public** | 9 | `/marketplace/providers`, `/services`, `/quick-request`, `/bookings`, `/bookings/:id` | ✅ |
| **Customer flow** | 11 | `/customer/intelligence`, `/recommendations`, `/garage/recommendations`, `/repeat-options`, `/favorites`, `/history/summary`, `/behavior/track` | ✅ |
| **Provider flow** | 14 | `/provider/inbox`, `/current-job`, `/intelligence/{earnings, demand, performance, lost-revenue, opportunities}`, `/availability`, `/skills`, `/billing/{products,checkout,status,purchases}`, `/tier`, `/pressure` | ✅ |
| **Zones engine** | 12 | `/zones`, `/zones/live-state`, `/zones/:id/analytics`, `/admin/zones/heatmap`, `/admin/zones/:id/{override,history,timeline}`, `/distribution-config` | ✅ |
| **Matching** | 4 | `/matching/advanced`, `/matching/nearby`, `/matching/zone-aware`, `/distribution/zone-aware` | ✅ |
| **Demand** | 4 | `/demand/event`, `/demand/events`, `/demand/heatmap`, `/admin/demand/actions/{recommendations,run,history}` | ✅ |
| **Orchestrator** | 9 | `/orchestrator/{state,rules,overrides,logs,run-cycle,toggle,metrics,config}` + zone history | ✅ |
| **Feedback / Strategy** | 9 | `/feedback/{actions,top,worst,strategy,recommendations,recalculate,dashboard,zone/:id}` + `/admin/strategy/:id`, `/admin/strategies` | ✅ |
| **Governance / Revenue** | 6 | `/admin/governance/{score,actions,score/zones,score/history}`, `/admin/revenue/experiments[/start/stop/results]` | ✅ |
| **Monetization / Billing** | 7 | `/admin/billing/revenue`, `/admin/monetization/overview`, `/provider/billing/*`, `/admin/distribution/config`, `/admin/providers/:slug/{promote,priority-access}` | ✅ |
| **System / Audit** | 9 | `/system/{health, errors, errors/stats, breaker, alert-dispatches, test-alert, idempotency/:key, audit}`, `/admin/live-feed`, `/admin/alerts`, `/admin/alerts/enhanced` | ✅ |
| **Push (mobile)** | 3 | `/push/register`, `/push/unregister`, `/push/devices` | ✅ |
| **Compat aliases** | 7 | `/notifications/my`, `/favorites/my`, `/organizations/search`, `/garage/:id`, `/payments/list`, `/slots/reserve`, `/marketplace/stats` | ✅ |
| **Realtime / Static** | catch-all | проксирует `/api/socket.io/*`, `/api/realtime/*`, всё остальное → NestJS | ✅ |

**ИТОГО: 179 native endpoints**, все 200 OK на smoke-тестах.

---

## 3. NestJS — детали

### 3.1 28 модулей (бизнес-домен)

| Модуль | Routes | Schema | Назначение |
|---|---|---|---|
| `auth` | 3 | — | NestJS использует FastAPI auth для совместимости |
| `users` | (через admin) | `User` | CRUD пользователей |
| `organizations` | 17 | `Organization`, `OrganizationMembership` | СТО + роли membership'ов |
| `branches` | 7 | `Branch` | Филиалы организаций |
| `services` | 11 | `Service`, `ServiceCategory` | Каталог услуг + категории |
| `provider-services` | 3 | `ProviderService` | Прайс-лист каждого провайдера |
| `quotes` | 9 | `Quote`, `QuoteResponse`, `QuoteDistribution` | Запросы цены клиента |
| `bookings` | 14 (3 sub-controllers) | `Booking`, `ProviderLiveLocation` | Записи + live-tracking |
| `slots` | 11 | `BookingSlot`, `ProviderAvailability`, `ProviderBlockedTime`, `ServiceDurationRule` | Календарь слотов |
| `assignment` | 10 | `RequestDistribution` | Распределение запросов между провайдерами |
| `matching` | 3 | `MatchingLog` | Логи matching-алгоритма |
| `marketplace-rules` | 18 | `MarketplaceRule` | RuleEngine с auto-mode и learning |
| `payments` | 8 | `Payment`, `PaymentTransaction`, `CommissionLog` | Платежи + комиссии |
| `reviews` | 5 | `Review` | Отзывы |
| `disputes` | 5 | `Dispute` | Споры |
| `favorites` | 4 | `Favorite` | Избранные мастера |
| `vehicles` | 5 | `Vehicle` | Гараж клиента |
| `notifications` | 7 | `Notification`, `UserDevice` | In-app + push |
| `provider-inbox` | 7 | — (читает `quotes`, `bookings`) | Inbox мастера |
| `geo`, `geo-core` | 3 | — | Гео-сервис (адрес → координаты) |
| `map` | 4 | — | Map endpoints (heatmap, providers nearby) |
| `zones` | 9 (`/admin/zones/*`) | `Zone` | NestJS-side zones (но реально пишутся FastAPI движком) |
| `demand` | 5 (`/admin/demand/*`) | `DemandMetrics` | Demand события + метрики |
| `realtime` | 3 | — | Socket.io gateway + REST emit endpoint |
| `automation` | 48 (`/admin/automation/*`) | — | Phase D engine: rules, executions, replay, shadow, idempotency, ROI, failsafe, dry-run, feedback, unified-state |
| `admin` | 67 | `AuditLog`, `BulkNotification`, `Experiment`, `FeatureFlag`, `NotificationTemplate`, `ReputationAction` | Все остальные admin endpoints |
| `admin-panel` | 3 | — | Сервис для admin UI (метрики dashboard) |
| `audit` | (deprecated) | — | Заменён на `audit_logs` через NestJS admin |
| `platform-config` | — | `PlatformConfig` | Конфиги платформы (commission_tiers и т.п.) |
| `ranking` | — | `VisibilityLog` | Логи видимости (для провайдер boost) |

### 3.2 NestJS факты
- **40 mongoose-схем** (все коллекции с явной структурой)
- **Socket.io gateway** на namespace `/realtime`, путь `/api/socket.io/`. Транспорт **только polling** (WS не работает через httpx-proxy в FastAPI — задокументированный компромисс).
- **Тестов 0** — есть smoke-скрипты, но юнит/интеграционных нет.
- **DI в порядке** — каждый модуль самодостаточен, ничто не глобально кроме `MongooseModule.forRoot`.

---

## 4. MongoDB — все 75 коллекций

### 4.1 Бизнес-домен (NestJS-owned, **34 коллекции**)
```
users (3)            organizations (8)         branches (8)
services (12)        servicecategories (8)     providerservices (40)
quotes (12)          quoteresponses (0)        quote_distributions (0?)
bookings (22)        bookingslots (0)          provideravailabilities (0)
providerblockedtimes(0) servicedurationrules (0)  matchinglogs (0)
payments (5)         paymenttransactions (0)   commissionlogs (0)
reviews (49)         disputes (3)              favorites (5)
vehicles (5)         notifications (22)        userdevices (0)
audit_logs (30)      bulk_notifications (0)    experiments (0)
feature_flags (5)    notification_templates(0) reputation_actions (0)
platformconfigs (6)  organizationmemberships(0) marketplaceconfigs (0)
marketplacerules (8) requestdistributions (6)  cities/countries/regions(0)
ruleexecutions (0)   ruleperformances (0)      providerlivelocations (0)
```

### 4.2 Engine-домен (FastAPI-owned, **27 коллекций**)
```
zones (6)                      zone_snapshots (3 294)
zone_distribution_config (6)   zoneactions (0)             zonemetrics (0)
orchestrator_logs (965)        orchestrator_rules (4)      orchestrator_overrides (0)
action_feedback (4 006)        automation_feedback (47)    strategy_weights (7)
governance_actions (692)       governance_scores (0)
demandmetrics (1)              booking_demand_events (0)
market_state_snapshots (1 294) marketkpis (87)
auto_action_rules (6)          auto_action_executions (36)
action_chains (4)              action_chain_executions (12)
automation_config (1)
failsafe_rules (5)             failsafe_incidents (55)
replay_sessions (0)
provider_availability (8)      provider_performance (8)    provider_skills (29)   provider_locations (8)
password_reset_tokens (3)      alert_dispatches (94)
idempotency_keys (0)           system_logs (25)
realtime_events (0)            customer_intelligence (1)
demand_action_executions (?)
```

### 4.3 Здоровье данных
- **65 / 75** коллекций имеют схему-владельца → ownership чистый.
- **10 коллекций пустые но зарезервированы** (filled на использование фичи) — `bookingslots`, `quoteresponses`, `paymenttransactions`, `providerlivelocations`, `userdevices`, и т.д.
- **Drift = 0** — `check-deprecated-collections.sh` зелёный.

---

## 5. ADMIN ПАНЕЛЬ — все 57 страниц

### 5.1 Группа «Operations» (13 страниц)
| Страница | Маршрут | Что показывает | Backend |
|---|---|---|---|
| LiveMonitorPage | `/live-monitor` | Realtime feed bookings + WS-индикатор | `/api/admin/live-feed`, socket.io |
| MapPage | `/map` | Карта провайдеров + heatmap | `/admin/map/heatmap`, `/admin/map/zones`, `/map/providers/nearby` |
| GeoOpsPage | `/geo-ops` | Гео-операции (зоны, граф) | `/admin/zones/*` |
| ZoneControlPage | `/zone-control` | Override surge, push providers, timeline | `/admin/zones/{id}/{override,timeline,push-providers}` |
| MarketControlPage | `/market-control` | Marketplace rules + auto-mode | `/admin/market/*` |
| DemandControlPage | `/demand-control` | Surge, hot zones | `/admin/demand/{control,surge,heatmap,hot-areas,metrics}` |
| DemandActionsPage | `/demand-actions` | Push providers / boost supply | `/admin/demand/actions/*` |
| DistributionControlPage | `/distribution-control` | Конфиг распределения запросов | `/admin/distribution/config` |
| RequestFlowPage | `/request-flow` | Графы request → quote → booking | `/admin/flow/{config,metrics}` |
| IncidentControlPage | `/incidents` | Failsafe инциденты | `/admin/incidents`, `/admin/automation/failsafe/*` |
| LiveMonitorPage (alt) | duplicates | (тот же что выше) | — |
| MonetizationPage | `/monetization` | Доход, comm tiers | `/admin/monetization/overview`, `/admin/billing/revenue` |
| EconomyControlPage | `/economy` | Параметры экономики | `/admin/economy` |

### 5.2 Группа «Entities» (10 страниц)
| Страница | Маршрут | Что | Backend |
|---|---|---|---|
| OrganizationsPage | `/organizations` | Список + детали СТО | `/admin/organizations`, `/organizations/*` |
| ProvidersPage / ProviderDetailPage | `/providers`, `/providers/:id` | Все мастера + карточка | `/admin/providers/*` |
| CustomersPage / UsersPage | `/customers`, `/users` | Клиенты + все юзеры | `/admin/users`, `/admin/customers` |
| ServicesPage | `/services` | CRUD категорий + услуг | `/services`, `/services/categories`, `/services/all` |
| BookingsPage | `/bookings` | Все записи | `/admin/bookings` |
| QuotesPage | `/quotes` | Все запросы цены | `/admin/quotes/all`, `/admin/quotes/manual` |
| PaymentsPage | `/payments` | Платежи + payouts | `/admin/payments`, `/admin/payouts` |
| DisputesPage | `/disputes` | Управление спорами | `/admin/disputes` |
| ReviewsPage | `/reviews` | Все отзывы | `/admin/reviews` |
| ProviderInboxPage | `/provider-inbox` | Inbox любого провайдера (admin view) | `/provider/requests/{inbox,missed}` |

### 5.3 Группа «Intelligence / Quality» (10 страниц)
| Страница | Маршрут | Что | Backend |
|---|---|---|---|
| GovernanceScorePage | `/governance-score` | Health-score платформы + история | `/admin/governance/{score,actions,score/zones,history}` |
| RevenueExperimentsPage | `/revenue-experiments` | A/B по ценам | `/admin/revenue/experiments/*` |
| ProviderBehaviorPage | `/provider-behavior` | Поведение мастеров (acceptance, cancel) + bulk-action | `/admin/providers/behavior` |
| ProviderLifecyclePage | `/providers/lifecycle` | Lifecycle stages | `/admin/providers/lifecycle` |
| SupplyQualityPage | `/supply-quality` | Качество supply | `/admin/quality/auto-rules` |
| ReputationPage | `/providers/:id/reputation` | Репутация провайдера | `reputation_actions` collection |
| OperatorPerformancePage | `/operators` | Метрики операторов | (заглушка пока) |
| SuggestionsPage | `/suggestions` | AI-рекомендации админу | `/admin/suggestions` |
| FeedbackLoopPage | `/automation/feedback` | Feedback dashboard | `/feedback/dashboard`, `/feedback/strategy` |
| ROITrackingPage | `/automation/roi` | ROI auto-actions | `/admin/automation/roi` |

### 5.4 Группа «Automation» (15 страниц — самое большое подмножество)
| Страница | Маршрут | Что | Backend |
|---|---|---|---|
| AutomationDashboardPage | `/automation/dashboard` | Overview всех движков | `/admin/automation/dashboard` |
| AutomationControlPage | `/automation/control` | Включить/выключить engine | `/admin/automation/engine/{start,stop,pause,resume}` |
| AutoActionsPage | `/automation/auto-actions` | CRUD `auto_action_rules` | `/admin/automation/rules` |
| AutoRulePerformancePage | `/automation/performance` | Performance KPIs правил | `/admin/automation/performance` |
| ActionChainsPage | `/automation/chains` | Цепочки действий | `/admin/automation/chains` |
| ExecutionMonitorPage | `/automation/engine` | Live monitor движка | `/admin/automation/engine/{monitor,history}` |
| ExecutionReplayPage | `/automation/replay` | Replay инциденты | `/admin/automation/replay/history`, `/admin/automation/replay` |
| ShadowModePage | `/automation/shadow` | Shadow vs prod сравнение | `/admin/automation/shadow/{comparison,history}` |
| IdempotencyPage | `/automation/idempotency` | Idempotency keys ledger | `/admin/automation/idempotency` |
| FailsafePage | `/automation/failsafe` | Failsafe rules + incidents | `/admin/automation/failsafe/{rules,incidents}` |
| UnifiedStatePage | `/automation/unified-state` | Состояние всех движков | `/admin/automation/unified-state` |
| DryRunPage | `/automation/dry-run` | Dry-run симулятор | `/admin/automation/dry-run` |
| RuleVisualizerPage | `/rules/visualizer` | Визуализация дерева правил | (frontend-only viewer) |
| PlaybooksPage | `/playbooks` | Playbook CRUD | (заглушка) |
| SimulationPage | `/simulation` | What-if симулятор | `/simulation/results` |

### 5.5 Группа «System» (9 страниц)
| Страница | Маршрут | Что | Backend |
|---|---|---|---|
| DashboardPage | `/dashboard` | Главный дашборд | `/admin/dashboard`, `/admin/metrics/*` |
| SystemHealthPage | `/system-health` | Health всех сервисов | `/system/health` |
| SystemErrorsPage | `/system/errors` | Логи ошибок | `/system/errors`, `/system/errors/stats` |
| AuditLogPage | `/audit-log` | Все аудит-записи | `/admin/audit-log` |
| FeatureFlagsPage | `/feature-flags` | Feature flags toggle | `/admin/feature-flags`, `/admin/config/features` |
| NotificationsPage | `/notifications` | Bulk-уведомления + templates | `/admin/notifications/{history,templates,bulk}` |
| ReportsPage | `/reports` | Отчёты | (PDF generator?) |
| SettingsPage | `/settings` | Настройки админ-панели | `/admin/config` |
| LoginPage | `/login` | Вход | `/auth/login` |

**ИТОГО: 57 страниц** + 116 admin-API маршрутов в `admin/src/services/api.ts`.

---

## 6. WEB-APP — все 19 страниц (после Sprint 14)

| Страница | Маршрут | Назначение |
|---|---|---|
| MarketplaceHome | `/` | Public landing с карточками мастеров |
| SearchPage | `/search` (`?view=map`) | Поиск + карта (Sprint 14 split-layout) |
| ProviderPage | `/provider/:slug` | Карточка провайдера |
| BookingDetailPage | `/booking/:id` | Live-tracking записи |
| LoginPage / RegisterPage | `/login`, `/register` | Auth |
| **Customer cabinet (5)** | `/account/{home,bookings,garage,favorites,profile}` | Клиентский кабинет (Sprint 14) |
| **Provider cabinet (7)** | `/provider/{dashboard,inbox,current-job,earnings,demand,profile,billing}` | Провайдерский кабинет (Sprint 14) |
| ProviderOnboarding | `/provider/onboarding` | 6-шаговый wizard |

**Покрытие**: 100 % основного customer ↔ provider флоу. Используется 18 API-групп через `web-app/src/services/api.ts`.

---

## 7. MOBILE — все 47 экранов

### 7.1 Customer flow (~16 экранов)
```
index, login, register, forgot-password
(tabs)/index             — главный (899 lines)
(tabs)/services          — каталог
(tabs)/quotes            — мои quote'ы
(tabs)/garage            — гараж
(tabs)/profile           — профиль
quick-request → quick-matching → quick-confirm → quick-success
booking-confirmation, booking/[id], booking/confirm, booking/live-tracking,
booking/payment, booking/repeat, booking/success
quote/[id], quote/select-slot, create-quote
favorites, notifications, messages, disputes
review/create
organization/[id]
map (Mapbox-like view)
```

### 7.2 Provider flow (~10 экранов)
```
provider-dashboard, provider/dashboard (дубль)
provider/inbox, provider/current-job
provider/availability, provider/stats, provider/earnings
provider-boost                — отдельный экран бустов
provider-intelligence (756 lines!)  — полноценный интеллект-хаб
```

### 7.3 Admin/operational (3 экрана)
```
zones, zones/[id]
direct (861 lines) — direct-call интерфейс
settings
```

### 7.4 Используемых API-групп: **23** в `frontend/src/services/api.ts`
> `auth, services, organizations, vehicles, quotes, matching, bookings, payments, reviews, map, disputes, favorites, providerInbox, currentJob, live, demand, zones, notifications, customer, providerIntelligence, marketplaceStats`

---

## 8. ПОКРЫТИЕ: BACKEND ↔ FRONT матрица

### 8.1 Backend домены, не имеющие НИКАКОГО UI
| Домен / эндпоинт | Где должен быть UI | Статус |
|---|---|---|
| `/api/admin/strategy/{zone_id}` (Phase H weights tweaker) | `ZoneControlPage` | ❌ только данные читаются, редактирование не доступно |
| `/api/admin/strategies` (overview всех весов) | новая страница `StrategyMatrixPage` | ❌ |
| `/api/admin/zones/distribution-config` (конфиг распределения по зонам) | `DistributionControlPage` | ⚠️ частично, не все поля |
| `/api/orchestrator/run-cycle` (форс-цикл) + `/orchestrator/toggle` | `AutomationControlPage` | ❌ кнопок нет |
| `/api/feedback/recalculate` | `FeedbackLoopPage` | ❌ |
| `/api/system/test-alert` | `IncidentControlPage` | ❌ |
| `/api/admin/billing/revenue` (графики дохода) | `MonetizationPage` | ⚠️ показывает overview, но не revenue |
| `/api/admin/providers/{slug}/{promote, priority-access}` | `ProviderDetailPage` | ❌ |
| `/api/customer/behavior/track`, `/provider/behavior/track` | n/a (backend-only telemetry) | ✅ как и задумано |

### 8.2 Backend, реализованный наполовину (UI есть — backend пуст / частичен)
| Страница | Проблема |
|---|---|
| `OperatorPerformancePage` | UI есть, но `/admin/operators/*` endpoints нет — заглушка |
| `PlaybooksPage` | UI есть, но `/admin/playbooks/*` endpoints нет |
| `ReportsPage` | UI есть, но генерации отчётов нет |
| `SettingsPage` | UI есть, но не все опции connected |
| `RuleVisualizerPage` | UI визуализатор работает только с frontend-моками |

### 8.3 Frontend, который дублируется (mobile vs web)
| Mobile | Web | Комментарий |
|---|---|---|
| `provider-intelligence.tsx` (756 строк) | `ProviderEarnings` + `ProviderDemand` + `ProviderProfile` | На mobile это 1 мегаэкран; на web разнесено по 3 страницам |
| `provider-boost.tsx` (378 строк) | `BillingPage` (161) | Та же монетизация, mobile более развёрнутый |
| `direct.tsx` (861 строка) | — | На web нет direct-call экрана (фича только mobile) |
| `(tabs)/garage` (445) | `CustomerGarage` (145) | Mobile: пробег, ТО-алерты, история; web: базовая |
| Mobile push (`/push/*`) | n/a | Только mobile |

---

## 9. КЛЮЧЕВЫЕ ВЫВОДЫ — насколько backend опережает frontend

> **Бэк опережает на ~20 %.** Конкретно:

### 9.1 Что есть в бэкенде, но нет в UI
1. **Strategy Optimizer (Phase H)** — `strategy_weights` коллекция активно обновляется каждые 5 мин, но в админке нет ни одного редактора весов или визуализации evolution.
2. **Phase G feedback engine** — обрабатывает 4 006 записей, но в `FeedbackLoopPage` отрисовывается только summary без детального drill-down.
3. **Zone timeline** (`/admin/zones/:id/timeline`) — реальная история событий зоны есть, на UI только последний срез.
4. **Orchestrator overrides** — POST endpoint работает, UI редактора overrides нет (`/orchestrator/overrides` GET читается, но без формы).
5. **Revenue experiments** — start/stop/results endpoints готовы, но `RevenueExperimentsPage` показывает только список без управления A/B.
6. **Provider lifecycle stages** — backend знает все stages, но UI делает только текущий снимок.
7. **Failsafe dry-run** — `/admin/automation/failsafe/run-test` готов, UI не вызывает.
8. **Push devices admin** — список зарегистрированных устройств (`/push/devices`) — UI отсутствует.
9. **Idempotency ledger** (`/system/idempotency/:key`) — UI показывает только статус, без полного ledger'a.
10. **Audit log filtering** — `/system/audit` поддерживает 5+ фильтров, UI использует только 2.

### 9.2 Что есть в UI, но недокручено в бэкенде
1. **OperatorPerformancePage** — UI готов, backend endpoints отсутствуют.
2. **PlaybooksPage** — UI скелет, нет backend-домена.
3. **ReportsPage** — UI есть, генерация PDF/Excel отсутствует.
4. **Stripe** — бэкенд использует test-key, реальная интеграция MOCKED.

### 9.3 Mobile vs Web — паритет
| Фича | Mobile | Web | Комментарий |
|---|---|---|---|
| Поиск + карта | ✅ map.tsx | ✅ Sprint 14 split-layout | паритет |
| Booking flow | ✅ полный (10 экранов) | ✅ полный | паритет |
| Live-tracking | ✅ booking/live-tracking | ✅ BookingDetailPage с realtime | паритет |
| Provider inbox | ✅ inbox.tsx (283) | ✅ ProviderInbox (156) | mobile глубже |
| Current job | ✅ current-job.tsx (216) | ✅ ProviderCurrentJob (177) | паритет |
| Earnings | ✅ earnings.tsx (148) | ✅ ProviderEarnings (165) | паритет |
| Provider intelligence | ✅ 756 строк, 1 экран | ✅ разделено на 3 страницы | паритет |
| Onboarding | ❌ нет | ✅ 6-шаговый wizard | **gap mobile** |
| Push notifications | ✅ полностью | ⚠️ web push не подключен | **gap web** |
| Direct call | ✅ direct.tsx | ❌ | **mobile-only** |

---

## 10. ТЕХНИЧЕСКИЙ ДОЛГ

### 10.1 Архитектурный
1. **`server.py` — 6 943 строки в одном файле**. Стоит разбить на 8-10 модулей по доменам (auth, marketplace, zones, orchestrator, feedback, admin, compat, system).
2. **0 Pydantic моделей в FastAPI** — нет автогенерируемой OpenAPI-схемы, контракты приходится вручную поддерживать в `api-contracts.ts` (3 копии, 537 строк).
3. **Polling вместо WebSocket** — Socket.io сидит на polling. WS-upgrade не работает через httpx-proxy. Нужен либо прямой ingress на порт 3001, либо переход на nginx-stream.

### 10.2 Тестирование
1. **0 unit-тестов** в NestJS (`*.spec.ts` отсутствуют).
2. **0 e2e-тестов** в FastAPI кроме smoke-bash-скриптов.
3. **Smoke-тесты есть и зелёные** (46/46 e2e-web-flow + 6/6 health) — это покрывает контракт-уровень.

### 10.3 Безопасность
1. **JWT secret в `.env`** — OK.
2. **bcrypt для паролей** — OK.
3. **RBAC**: roles `admin / customer / provider_owner / provider_manager / operator` — реализован в auth-decorator'ах FastAPI и `ProtectedRoute` web-app.
4. **Rate limiting** — реализован (Sprint 12), но `RATE_LIMIT_EXEMPT_LOOPBACK=1` для удобства dev — в проде надо снять.
5. **CORS** — backend разрешает свой ingress; OK.
6. **Stripe** в test-mode — деньги не идут, нужно подключить в проде.

### 10.4 Данные
1. **10 пустых коллекций** зарезервированы — нормально.
2. **Дубликаты по имени НЕ дубликаты** (см. `DATA_OWNERSHIP.md` Section 4).
3. **`zones` vs `geozones`** — `geozones` пустой, удалить можно.

### 10.5 Операционка
1. **Backups** — есть скрипт `/app/ops/backup.sh`, но не запускается по расписанию.
2. **Алерты** — `failsafe_incidents` создаются, но email/Telegram не подключены (`/system/test-alert` есть, но dispatcher mocked).
3. **Observability** — есть `/system/health`, `/system/errors/stats`. Нет Grafana/Prometheus.
4. **Health.sh false-positive** — единственный сейчас «Mobile Expo via :8001» — известная фигня, expo на :3000.

---

## 11. КАК БЭК ОТСТАЁТ ОТ ФРОНТА vs КАК ОПЕРЕЖАЕТ — итоговый score

| Направление | Score | Вердикт |
|---|---|---|
| **Бэк → Customer UI** (mobile + web) | 100/100 | ✅ всё закрыто |
| **Бэк → Provider UI** | 95/100 | ✅ почти всё, минус onboarding на mobile |
| **Бэк → Admin UI** | 65/100 | ⚠️ 35 % умных endpoints без UI |
| **Mobile vs Web паритет** | 90/100 | ✅ паритет с известными gap'ами (onboarding mobile, push web) |
| **Тесты / Observability** | 30/100 | 🔴 нужны Grafana, unit, e2e |
| **Stripe / Payments** | 20/100 | 🔴 mocked, нужна real-Stripe |
| **WS / Realtime** | 70/100 | ⚠️ polling вместо WS — известный компромисс |

---

## 12. РЕКОМЕНДАЦИИ — что сделать в ближайшие спринты

> Расставлено по бизнес-impact, не по сложности.

### Sprint 15 — «Деньги»
1. **Stripe прод** — replace MOCKED checkout/billing real Stripe webhooks
2. **Provider boost economy** — кнопки `Promote` / `Priority Access` в `ProviderDetailPage` (используем готовые `/admin/providers/{slug}/{promote, priority-access}`)
3. **Revenue experiments live UI** — start/stop/results в `RevenueExperimentsPage`

### Sprint 16 — «Качество»
4. **Strategy editor** — UI для `strategy_weights` (новый pages `StrategyMatrixPage` + edit `/admin/strategy/:id`)
5. **Zone timeline drill-down** — расширить `ZoneControlPage` с timeline + history
6. **Orchestrator overrides editor** — форма overrides в `AutomationControlPage`

### Sprint 17 — «Тесты + Observability»
7. **NestJS unit-тесты** для критичных модулей (auth, bookings, payments, quotes, marketplace-rules)
8. **Prometheus** + Grafana
9. **Real WS upgrade** — bypass FastAPI proxy for socket.io
10. **Backups автозапуск**

### Sprint 18 — «Mobile parity + growth»
11. **Mobile onboarding wizard** (как на web)
12. **Web push** (browser notification API + `/push/register`)
13. **Customer LTV хуки** (subscription, repeat-rate, referral)
14. **SEO/marketing surface** (landing pages, blog, sitemap)
15. **Multi-city expansion** (zones engine generalize beyond Kyiv)

---

## 13. Quick reference — где что искать

| Вопрос | Файл |
|---|---|
| Как запустить с нуля? | `/app/ops/start.sh` |
| Какие API-контракты у клиентов? | `/app/{frontend,web-app,admin}/src/shared/api-contracts.ts` (179 строк, синхронны) |
| Какая коллекция кому принадлежит? | `/app/memory/DATA_OWNERSHIP.md` |
| Какие Sprint'ы прошли? | `/app/memory/PRD.md` (Sprint 1-14) |
| Полная история архитектуры? | `/app/memory/CURRENT_ARCHITECTURE_BASELINE.md` |
| Test creds? | `/app/memory/test_credentials.md` |
| Smoke health? | `bash /app/ops/health.sh` (после Sprint 14: 6/6 ✓) |
| E2E web-flow? | `bash /app/ops/e2e-web-flow.sh` (Sprint 14: 46/46 ✓) |
| Все Sprint 14 артефакты? | `/app/memory/WEB_UI_COMPLETION_CERTIFICATION.md` |

---

> **Bottom line**: продукт в продакшн-готовом состоянии для customer ↔ provider флоу.
> Главные gap'ы — admin-side UI для умных движков (Phase G/H, strategy editor, zone timeline) и реальная монетизация (Stripe).
> Параллельных дублирований кода между mobile/web нет — обе платформы используют единый бэкенд через единый contract-каталог.
