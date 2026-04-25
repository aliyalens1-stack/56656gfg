# DATA OWNERSHIP MATRIX — Sprint 3

> 1 сущность = 1 коллекция = 1 owner = 1 контракт чтения/записи.
> Любое отклонение от этой матрицы — баг и должен быть отражён в issue.

## Владельцы

- **NestJS** (`/app/backend/src/modules/`) — бизнес-домен: CRUD, auth, валидация, связи через Mongoose.
- **FastAPI engines** (`/app/backend/server.py`) — оркестрация, аналитика, realtime-state; прямые Motor-запросы.
- Пересечений writer'ов быть **не должно**. Если обе стороны читают — то только одна пишет.

---

## Section 1 — Business domain (NestJS owner)

| Entity | Canonical collection | NestJS schema class | Writers | Readers |
|---|---|---|---|---|
| Users | `users` | `User` (users/user.schema.ts) | NestJS auth + FastAPI seed_data | NestJS, FastAPI auth, engines |
| Organizations | `organizations` | `Organization` | NestJS + FastAPI seed | NestJS, FastAPI matching/engines |
| Services | `services` | `Service` | NestJS + FastAPI seed | NestJS, FastAPI |
| Service categories | `servicecategories` | `ServiceCategory` | NestJS + FastAPI seed | both |
| Bookings | `bookings` | `Booking` | NestJS CRUD, FastAPI seed_demo | both |
| Quotes | `quotes` | `Quote` | NestJS | both |
| Quote responses | `quoteresponses` | `QuoteResponse` | NestJS | NestJS |
| Quote distribution | `quote_distributions` | `QuoteDistribution` | NestJS | NestJS |
| Payments | `payments` | `Payment` | NestJS + FastAPI seed_demo | both |
| Payment transactions | `paymenttransactions` | `PaymentTransaction` | NestJS | NestJS |
| Commission logs | `commissionlogs` | `CommissionLog` | NestJS | NestJS |
| Reviews | `reviews` | `Review` | NestJS + FastAPI seed | both |
| Notifications | `notifications` | `Notification` | NestJS + FastAPI seed_demo | both |
| User devices (push tokens) | `userdevices` | `UserDevice` | NestJS | NestJS push + FastAPI /push/* |
| Vehicles | `vehicles` | `Vehicle` | NestJS + FastAPI seed_demo | both |
| Favorites | `favorites` | `Favorite` | NestJS + FastAPI seed_demo | both |
| Disputes | `disputes` | `Dispute` | NestJS + FastAPI seed_demo | both |
| Branches | `branches` | `Branch` | NestJS | NestJS |
| Cities / Countries / Regions | `cities`/`countries`/`regions` | NestJS geo | NestJS | NestJS |
| Organization memberships | `organizationmemberships` | — | NestJS | NestJS |
| Provider services (price list) | `providerservices` | `ProviderService` | NestJS | NestJS matching |
| Provider blocked time (vacation) | `providerblockedtimes` | `ProviderBlockedTime` | NestJS | NestJS slots |
| Provider availability (weekly slots) | `provideravailabilities` | `ProviderAvailability` | NestJS | NestJS slots |
| Booking slots | `bookingslots` | `BookingSlot` | NestJS | NestJS slots |
| Service duration rules | `servicedurationrules` | `ServiceDurationRule` | NestJS | NestJS slots |
| Matching logs | `matchinglogs` | `MatchingLog` | NestJS | NestJS matching |
| Marketplace rules (learning) | `marketplacerules` | — | NestJS | NestJS |
| Marketplace configs | `marketplaceconfigs` | — | NestJS | NestJS |
| Request distributions | `requestdistributions` | `RequestDistribution` | NestJS | NestJS assignment |

### Admin domain (NestJS admin module)
| Entity | Canonical collection | NestJS schema class |
|---|---|---|
| Audit logs | `audit_logs` | `AuditLog` |
| Bulk notifications | `bulk_notifications` | `BulkNotification` |
| Experiments | `experiments` | `Experiment` |
| Feature flags | `feature_flags` | `FeatureFlag` |
| Notification templates | `notification_templates` | `NotificationTemplate` |
| Reputation actions | `reputation_actions` | `ReputationAction` |
| Platform configs | `platformconfigs` | `PlatformConfig` |

---

## Section 2 — Engine / Analytics domain (FastAPI owner)

| Entity | Canonical collection | Writer | Readers |
|---|---|---|---|
| Zones (simple hot-zone state) | `zones` | FastAPI zone engine (10s) | FastAPI + NestJS zones module reads |
| Zone snapshots (history) | `zone_snapshots` | FastAPI zone engine + startup seed | FastAPI analytics |
| Zone distribution config | `zone_distribution_config` | FastAPI | FastAPI |
| Orchestrator logs | `orchestrator_logs` | FastAPI orchestrator engine | FastAPI admin/live-feed |
| Orchestrator rules | `orchestrator_rules` | FastAPI seed | FastAPI |
| Orchestrator overrides | `orchestrator_overrides` | FastAPI admin endpoints | FastAPI |
| Action feedback (Phase G) | `action_feedback` | FastAPI feedback processor | FastAPI |
| Automation feedback | `automation_feedback` | FastAPI seed + runtime | both |
| Strategy weights (Phase H) | `strategy_weights` | FastAPI strategy optimizer | FastAPI |
| Governance actions | `governance_actions` | FastAPI governance endpoints | FastAPI admin/live-feed |
| Governance scores | `governance_scores` | FastAPI governance endpoint | FastAPI |
| Demand metrics | `demandmetrics` | FastAPI | FastAPI |
| Booking demand events | `booking_demand_events` | FastAPI + NestJS demand module | FastAPI zone engine |
| Market state snapshots | `market_state_snapshots` | FastAPI + seed | both |
| Market KPIs | `marketkpis` | NestJS automation | both |
| Auto-action rules (phase D) | `auto_action_rules` | FastAPI seed | both |
| Auto-action executions | `auto_action_executions` | FastAPI + NestJS automation | both |
| Action chains | `action_chains` | FastAPI seed | both |
| Action chain executions | `action_chain_executions` | FastAPI + NestJS | both |
| Automation config | `automation_config` | FastAPI seed | both |
| Failsafe rules | `failsafe_rules` | FastAPI seed | both |
| Failsafe incidents | `failsafe_incidents` | FastAPI + NestJS | both |
| Replay sessions | `replay_sessions` | NestJS automation | NestJS |

### Engine-owned provider/realtime collections
| Entity | Canonical | Writer | Readers | Notes |
|---|---|---|---|---|
| Provider weekly availability (engine) | `provider_availability` | FastAPI `seed_marketplace_data` | FastAPI matching | **NOT** the same as NestJS `provideravailabilities` (that one = appointment slots per branch) |
| Provider performance aggregates | `provider_performance` | FastAPI | FastAPI intelligence | — |
| Provider skills (category levels) | `provider_skills` | FastAPI | FastAPI matching | **NOT** same as `providerservices` (NestJS price list) |
| Provider static locations (matching pin) | `provider_locations` | FastAPI zone engine | FastAPI matching | NestJS `provider_live_locations` (geo-core) is live-tracking — different purpose |

### Realtime/auth engine
| Entity | Canonical | Writer | Readers |
|---|---|---|---|
| Password reset tokens (TTL 24h) | `password_reset_tokens` | FastAPI `/auth/forgot-password` | FastAPI `/auth/reset-password` |
| Demand action executions | `demand_action_executions` | FastAPI admin endpoints | FastAPI admin |

---

## Section 3 — Compatibility aliases (FastAPI compat_layer)

Эти URL-пути переписываются FastAPI'ем ДО catch-all прокси:

| Client path | → Target |
|---|---|
| `GET /notifications/my` | `GET /notifications` (NestJS) |
| `GET /favorites/my` | `GET /favorites` (NestJS) |
| `GET /organizations/search?q=X` | `GET /organizations?search=X` (NestJS) |
| `GET /garage/:id` | `GET /vehicles/:id` (NestJS) |
| `GET /payments/list` | `GET /payments/my` (NestJS) |
| `POST /slots/reserve` | `POST /slots/hold` (NestJS) |

---

## Section 4 — Similar-name collections — **NOT duplicates**, different concepts

| A | B | Verdict |
|---|---|---|
| `provider_availability` (FastAPI, weekly matching schedule, 8 docs) | `provideravailabilities` (NestJS, branch/weekday slot config, 0 docs) | **Keep both** (different domain models) |
| `provider_locations` (FastAPI, static pin per provider, 8 docs) | `provider_live_locations` / `providerlivelocations` (NestJS, live tracking during booking, 0 docs) | **Keep both** (different update frequency) |
| `provider_skills` (FastAPI, skill category + level, 33 docs) | `providerservices` (NestJS, price list per service, 0 docs) | **Keep both** |
| `zones` (FastAPI, engine hot-state, 6 docs) | `geozones` (NestJS GeoZone with polygon + metadata, 0 docs) | **Decision: consolidate later**, currently `zones` is canonical |
| `zonemetrics` / `zoneactions` (NestJS, 0 docs) | `zone_snapshots` (FastAPI, 3288 docs) | Different granularity — keep |
| `audit_logs` (NestJS + FastAPI seed_demo, 30 docs) | `audits` (NestJS alt name, 0 docs) | `audit_logs` is canonical, `audits` is deprecated |

---

## Section 5 — Deprecated / candidates for drop

Коллекции, которые пусты и **не нужны** ни одной из сторон (схемы отсутствуют или не используются):

| Collection | Docs | Reason |
|---|---|---|
| `audits` | 0 | Старый алиас; canonical = `audit_logs` |
| `geozones` | 0 | Старая NestJS GeoZone schema, замена — FastAPI `zones` |

Все остальные пустые коллекции (`paymenttransactions`, `commissionlogs`, `branches`, `cities`, `countries`, `regions`, и т.д.) **являются зарезервированными** — имеют живую NestJS-схему и заполнятся при первом использовании соответствующих фич.

---

## Section 6 — Canonical read rules

**FastAPI** читает только из engine/analytics коллекций (`zones`, `zone_snapshots`, `provider_*`, `orchestrator_*`, `action_feedback`, `strategy_weights`, `governance_*`, `auto_action_*`, `action_chains*`, `automation_*`, `failsafe_*`, `market_state_snapshots`, `password_reset_tokens`) + seed-write в бизнес (`users`, `organizations`, `services`, `bookings`, `vehicles` и т.п., только через `seed_*`).

**NestJS** читает/пишет бизнес-домен через свои Mongoose модели (всё в Section 1).

---

## Section 7 — Migration / tooling

| Tool | Path | Purpose |
|---|---|---|
| Collection inventory | `bash /app/ops/check-deprecated-collections.sh` | Находит deprecated коллекции с данными |
| Migration script | `node /app/ops/migrate-collections.js --dry-run / --apply / --apply-drop` | Миграция и удаление дубликатов |
| Data consistency smoke | `bash /app/ops/smoke-data-consistency.sh` | Проверка обязательных counts + API |
| Contracts smoke | `bash /app/ops/smoke-contracts.sh` | Проверка всех URL контрактов |
