# Auto Search Platform — PRD (Live Status)

## Overview
Uber-like маркетплейс автосервисов. Консолидированная кодовая база AUTO234 + L2PAD (Phase E/G/H).

## Architecture (поднято и работает)
- **Mobile App**: Expo SDK 54 + React Native + Expo Router (`/app/frontend/app/`) — port 3000
- **Admin Panel**: Vite + React 18 + Tailwind (`/app/admin/` → `dist/`) — served by FastAPI на `/api/admin-panel/`
- **Web Marketplace**: Vite + React 18 (`/app/web-app/` → `dist/`) — served by FastAPI на `/api/web-app/`
- **NestJS Backend**: 31 модуль, port 3001 (internal), скомпилирован в `/app/backend/dist/main.js`, запускается subprocess'ом из FastAPI
- **FastAPI Proxy + Phase E/G/H**: port 8001, native endpoints + catch-all proxy на NestJS
- **Database**: MongoDB (`auto_platform`) с 2dsphere geo-index
- **Real-time**: WebSocket через NestJS gateway, FastAPI эмитит события через `/api/realtime/emit`

## Live URLs (preview)
- Mobile (Expo):   `https://mobile-web-stack-2.preview.emergentagent.com/`
- Admin Panel:     `https://mobile-web-stack-2.preview.emergentagent.com/api/admin-panel/`
- Web Marketplace: `https://mobile-web-stack-2.preview.emergentagent.com/api/web-app/`
- API base:        `https://mobile-web-stack-2.preview.emergentagent.com/api/`

## Test Credentials (см. `/app/memory/test_credentials.md`)
- Admin:    `admin@autoservice.com` / `Admin123!`
- Customer: `customer@test.com` / `Customer123!`
- Provider: `provider@test.com` / `Provider123!`

## Last Commits (origin/main)
- `84894c1` Auto-generated changes
- `f59badc` auto-commit for 2c16ea10-…
- `425eef1` auto-commit for e7f04caf-…
- `4a22fcd` auto-commit for 61114e9c-…
- `0697fbb` auto-commit for fb6f4b4a-…
- `b1aa264` auto-commit for e76c1a16-…
- `596a6ee` Initial commit

## System Layers
- **Layer 1-6** (NestJS): Discovery → Match → Booking → Execution → Tracking → Realtime, Zone Engine, Surge Pricing, Demand Heatmap
- **Layer 7-8** (NestJS+FastAPI): Customer Intelligence (favorites, garage, recommendations), Provider Intelligence (earnings, performance)
- **Layer 9** (FastAPI Phase E): Orchestrator Engine (10s cycle, ENABLE_SURGE / PUSH_PROVIDERS / SET_FANOUT / …)
- **Layer 10** (FastAPI Phase G): Action Feedback Processor (15s, weighted scoring ETA/Conv/GMV/Ratio)
- **Layer 11** (FastAPI Phase H): Strategy Optimizer (5min, самообучение весов)
- **Sprint 6**: Observability (system_logs, /api/system/health, /api/system/errors)
- **Sprint 12**: idempotency, alerts, TTL indexes

## Notes
- Payments: **MOCKED** (Stripe test-key ожидает интеграции)
- Все фоновые движки стартуют вместе с FastAPI (supervisor `backend`)
- Supervisor: `backend` (FastAPI:8001 → запускает Nest:3001 subprocess), `expo` (Metro:3000), `mongodb`
