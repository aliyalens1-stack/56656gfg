# Auto Search Platform — Architecture Snapshot

## Изолированные модули (НЕ деградируют друг друга)

```
/app
├── backend/       # FastAPI (:8001) + NestJS compiled dist (:3001)
├── frontend/      # 📱 MOBILE EXPO (46 screens) — single.output web preview
├── admin/         # 🛠 ADMIN PANEL (Vite React, 57 pages → admin/dist)
├── web-app/       # 🌐 WEB MARKETPLACE (Vite React → web-app/dist)
├── ops/           # Все операционные скрипты
├── memory/        # PRD.md, test_credentials.md
├── test_reports/  # JSON-отчёты testing agent
└── tests/         # Pytest
```

**Правило изоляции**: ни один из `frontend/`, `admin/`, `web-app/` не импортирует код из другого. Проверка — `ops/split-check.sh`.

## Сервисы (supervisor)

| Name       | Port | Cmd                                     | Purpose                                    |
|------------|------|-----------------------------------------|--------------------------------------------|
| `backend`  | 8001 | `uvicorn server:app + NestJS auto-spawn`| FastAPI proxy + NestJS backend + 4 engines |
| `expo`     | 3000 | `yarn expo start --tunnel`              | Metro bundler (mobile web preview)         |
| `mongodb`  | 27017| `mongod`                                | Primary DB                                 |

## Встроенные FastAPI процессы (фоновые)

| Engine                | Period | Endpoint prefix            | Phase |
|-----------------------|--------|----------------------------|-------|
| Zone State Engine     | 10 s   | `/api/zones`               | D     |
| Market Orchestrator   | 10 s   | `/api/orchestrator/*`      | E     |
| Feedback Processor    | 15 s   | `/api/feedback/*`          | G     |
| Strategy Optimizer    | 5 min  | `/api/feedback/strategy`   | H     |

## NestJS модули (31)

```
auth, users, organizations, services, bookings, quote-requests, reviews,
matching (smart-matching), zones (zone-engine, surge), automation (rules + execution),
analytics, realtime (WebSocket gateway), payments (MOCKED),
provider-inbox, provider-intelligence, customer-intelligence,
marketplace-rules (learning-engine), map, notifications, favorites, vehicles,
disputes, governance, monetization, heatmap, map-intel, provider-lifecycle,
boost, reports
```

## Public URLs

| Клиент               | URL                                                                   |
|----------------------|-----------------------------------------------------------------------|
| Mobile (Expo web)    | `https://<host>/`                                                     |
| Admin Panel          | `https://<host>/api/admin-panel/`                                     |
| Web Marketplace      | `https://<host>/api/web-app/`                                         |
| API (FastAPI+NestJS) | `https://<host>/api/*`                                                |
| Health               | `https://<host>/api/health`                                           |

## DB (MongoDB)

Primary DB: `auto_search` (из `backend/.env`: `MONGO_URL=mongodb://localhost:27017`).

Seed-данные (создаются на старте FastAPI в `startup_event`):
- 8 organizations (СТО в Киеве)
- 12 services, 8 service_categories
- 6 zones (Kyiv districts с 2dsphere polygon)
- 288 zone_snapshots (48h backfill)
- 42 reviews, 8 provider_locations
- 3 users: admin / customer / provider
- 9 automation_rules, 12 feedback_rules

## Credentials

| Роль     | Email                       | Пароль        |
|----------|-----------------------------|---------------|
| Admin    | admin@autoservice.com       | Admin123!     |
| Customer | customer@test.com           | Customer123!  |
| Provider | provider@test.com           | Provider123!  |

## Операции (см. ops/RUNBOOK.md)

```bash
bash /app/ops/bootstrap.sh        # Cold start — свежий clone/кубер pod
bash /app/ops/start.sh            # Warm start (supervisor)
bash /app/ops/stop.sh             # Остановить всё
bash /app/ops/restart.sh          # Перезапустить всё
bash /app/ops/build.sh [admin|web|nest|all]
bash /app/ops/health.sh           # Проверка всех URL
bash /app/ops/logs.sh             # Просмотр логов (tail -f)
bash /app/ops/db-backup.sh        # mongodump → /app/backups/
bash /app/ops/db-restore.sh <path>
bash /app/ops/db-seed.sh          # Пересоздать seed (restart backend)
bash /app/ops/split-check.sh      # Проверить изоляцию модулей
```
