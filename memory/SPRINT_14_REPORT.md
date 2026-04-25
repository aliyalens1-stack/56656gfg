# Sprint 14 — Contract Integrity Fix · Completion Report

> Дата: 2026-04-25 · Статус: **DONE** · Исполнитель: e1

## Definition of Done — все пункты ✅

| Критерий | Состояние | Доказательство |
|---|---|---|
| 0 critical 404s (G-1…G-14) | ✅ | 14 detail-эндпоинтов отвечают 200; `/api/disputes` → 200; `slots/reserve` → 400 (валидация, не 404) |
| 0 fake routes в `api-contracts.ts` | ✅ | `slots.hold`, `slots.available`, `featureFlagsAlt` — удалены |
| Admin detail pages работают | ✅ | users/bookings/quotes/disputes/payments/reviews/orgs — 17 ручек 200 |
| `/disputes/my` доступен через `/disputes` | ✅ | FastAPI compat: `GET /api/disputes` → NestJS `disputes/my` |
| `slots/reserve` корректен | ✅ | Сломанный alias удалён, NestJS `@Post('slots/reserve')` отвечает напрямую через catch-all |
| Quick-request унифицирован | ✅ | Оба `{problem}` и `{serviceType}` принимаются на `/quotes/quick` и `/marketplace/quick-request` |
| Smoke health + key flow | ✅ | 7 базовых ручек 200 |

**Итог: 29/29 проверок прошли.**

---

## Изменения

### Block 1+2 — FastAPI compat (`/app/backend/server.py`)

```diff
-# --- Slots reserve alias ---
-@app.post("/api/slots/reserve")
-async def compat_slots_reserve(request: Request):
-    return await _proxy_to(request, "slots/hold")     # ❌ /slots/hold doesn't exist

+# --- Disputes list compat ---
+@app.get("/api/disputes")
+async def compat_disputes_list(request: Request):
+    return await _proxy_to(request, "disputes/my")
+
+# Sprint 14: removed broken slots/reserve alias.
+# Catch-all proxies POST /api/slots/reserve directly to NestJS.
```

Также `/api/marketplace/quick-request` теперь принимает `serviceType` как синоним `problem`.

### Block 3 — NestJS Admin Detail Layer

**`/app/backend/src/modules/admin/admin.service.ts`** — добавлено 16 методов:
- `getUserById`, `getUserActivity`, `getUserNotes`
- `getBookingById`, `getBookingTimeline`
- `getQuoteById`, `getQuoteResponses`
- `getDisputeById`, `getDisputeTimeline`, `getDisputeEvidence`
- `getPaymentById`, `getPaymentTimeline`
- `getReviewById`
- `getOrganizationPerformance`, `getOrganizationBookings`, `getOrganizationPayouts`

Все валидируют ObjectId, бросают `NotFoundException` при некорректном id, используют `findById`/`aggregate` без обвешивания транзакциями. Timeline-методы агрегируют события из `statusHistory`, `messages`, отдельных полей (`confirmedAt`, `resolvedAt` и т.д.).

**`/app/backend/src/modules/admin/admin.controller.ts`** — добавлены 17 GET-маршрутов под `@Roles(UserRole.ADMIN)` + `@UseGuards(JwtAuthGuard, RolesGuard)`.

### Block 4 — Contract cleanup

**`/app/{frontend,admin,web-app}/src/shared/api-contracts.ts`** — синхронизированы:

```diff
   disputes: {
-    list:        '/disputes',
+    list:        '/disputes/my',
     create:      '/disputes',
     byId:        (id: string) => `/disputes/${id}`,
   },
   ...
   slots: {
     reserve:     '/slots/reserve',
-    hold:        '/slots/hold',
-    available:   '/slots/available',
   },
   ...
   admin: {
-    featureFlags:     '/admin/config/features',
-    featureFlagsAlt:  '/admin/feature-flags',
+    featureFlags:     '/admin/feature-flags', // canonical
   },
```

### Block 5 — Quick request unification

**`/app/backend/src/modules/quotes/dto/quick-request.dto.ts`**:
- `serviceType` теперь optional (`@ValidateIf`)
- Добавлено поле `problem` (legacy alias)

**`/app/backend/src/modules/quotes/quotes.controller.ts`**:
```ts
quickRequest(@Req() req: any, @Body() dto: QuickRequestDto) {
  if (!dto.serviceType && dto.problem) {
    dto.serviceType = dto.problem as any;
  }
  return this.quickRequestService.createQuickRequest(req.user.sub, dto);
}
```

**`/app/backend/server.py`** (FastAPI marketplace endpoint):
```python
problem = body.get("problem") or body.get("serviceType") or "diagnostics"
```

---

## Метрики качества (после Sprint 14)

| Метрика | До | После |
|---|---|---|
| Критических 404 (admin detail) | **14** | **0** |
| Сломанных compat alias | **1** | **0** |
| Мёртвых записей в api-contracts | **3** | **0** |
| Контрактных синонимов quick-request | **2 несовместимых** | **2 совместимых** |
| Совпадение клиентских контрактов (mobile/admin/web) | private copies | **byte-for-byte identical** |
| NestJS endpoints | 289 | **306** (+17 admin detail) |

---

## Что **не** делалось (по архитектурному решению)

- ❌ Payouts module (отдельная коллекция) — использован derived view из `payments` для admin/organizations/:id/payouts. Полноценный модуль — Sprint 15+.
- ❌ Admin map module (`/admin/map/heatmap`, `/admin/map/zones`) — есть рабочая альтернатива `/admin/zones/heatmap`, `/admin/zones/control`.
- ❌ Admin metrics gaps (`/admin/metrics/categories|cities|conversion`) — некритично, ждут отдельного спринта.
- ❌ WebSocket upgrade (B-3) — Sprint 15 (Scale & Real-time Infra).

---

## Готовность к Sprint 15

Замок перед масштабированием закрыт. Контракт **= источник истины**. Можно идти в:
1. **Real WebSocket transport** (минуя FastAPI httpx-прокси)
2. **Event bus** (Redis Streams / NATS)
3. **Payouts** как отдельный домен
4. **Map analytics** для admin
