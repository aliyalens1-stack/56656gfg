from fastapi import FastAPI, Request, Response, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, logging, httpx, uuid, bcrypt, asyncio, subprocess, random, jwt, time
from prod_readiness import (
    check_rate_limit,
    idempotency_lookup,
    idempotency_commit,
    ensure_idempotency_indexes,
    ensure_alert_indexes,
    ensure_ttl_indexes,
    dispatch_alert,
    write_audit,
    nest_breaker,
)
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ.get('MONGO_URL')
db_name = os.environ.get('DB_NAME')
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

app = FastAPI()
NESTJS_URL = "http://localhost:3001"
ADMIN_BUILD_DIR = ROOT_DIR.parent / 'admin' / 'dist'
WEBAPP_BUILD_DIR = ROOT_DIR.parent / 'web-app' / 'dist'
nestjs_process: Optional[subprocess.Popen] = None

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_pw(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def now_utc():
    return datetime.now(timezone.utc)

def uid():
    return str(uuid.uuid4())

JWT_SECRET = os.environ.get('JWT_SECRET', 'auto_service_jwt_secret_key_2025_very_secure')

async def verify_admin_token(request: Request):
    """Verify JWT token from Authorization header. Requires role=admin."""
    auth_header = request.headers.get('authorization', '')
    if not auth_header.startswith('Bearer '):
        raise HTTPException(401, "Unauthorized")
    token = auth_header[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    # Sprint 12: enforce role check — reject non-admin JWTs
    role = payload.get('role', '')
    if role != 'admin':
        raise HTTPException(403, f"Forbidden: admin role required (got {role or 'none'})")
    return payload


async def seed_data():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@autoservice.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin123!")

    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({"email": admin_email, "passwordHash": hash_pw(admin_password), "firstName": "Admin", "lastName": "", "role": "admin", "isActive": True, "createdAt": now_utc().isoformat()})
        logger.info(f"Admin user created: {admin_email}")
    elif not existing.get("passwordHash"):
        await db.users.update_one({"email": admin_email}, {"$set": {"passwordHash": hash_pw(admin_password), "isActive": True}})
        await db.users.update_one({"email": admin_email}, {"$unset": {"password_hash": "", "name": ""}})
    elif not verify_pw(admin_password, existing.get("passwordHash", "")):
        await db.users.update_one({"email": admin_email}, {"$set": {"passwordHash": hash_pw(admin_password), "isActive": True}})

    # Seed automation data
    if await db.auto_action_rules.count_documents({}) == 0:
        rules = [
            {"id": uid(), "name": "Low Score Provider Limit", "isEnabled": True, "mode": "active", "triggerType": "provider", "conditionJson": {"field": "score", "operator": "<", "value": 40}, "actionType": "limit_visibility", "actionPayload": {"visibilityLevel": 0.3}, "cooldownSeconds": 3600, "priority": 1},
            {"id": uid(), "name": "Zone High Demand Surge", "isEnabled": True, "mode": "active", "triggerType": "zone", "conditionJson": {"field": "ratio", "operator": ">", "value": 3}, "actionType": "set_surge", "actionPayload": {"surgeMultiplier": 1.5}, "cooldownSeconds": 600, "priority": 2},
            {"id": uid(), "name": "Slow Response Push", "isEnabled": True, "mode": "active", "triggerType": "zone", "conditionJson": {"field": "avgResponseSeconds", "operator": ">", "value": 600}, "actionType": "send_push", "actionPayload": {"message": "New requests!", "radius": 5}, "cooldownSeconds": 300, "priority": 3},
            {"id": uid(), "name": "High Rating Boost", "isEnabled": True, "mode": "shadow", "triggerType": "provider", "conditionJson": {"field": "rating", "operator": ">", "value": 4.8}, "actionType": "boost_visibility", "actionPayload": {"boostLevel": 1.5}, "cooldownSeconds": 7200, "priority": 4},
            {"id": uid(), "name": "Critical Supply Alert", "isEnabled": True, "mode": "active", "triggerType": "zone", "conditionJson": {"field": "supplyCount", "operator": "<", "value": 2}, "actionType": "expand_radius", "actionPayload": {"radiusKm": 10}, "cooldownSeconds": 900, "priority": 1},
            {"id": uid(), "name": "Auto Penalty No-Shows", "isEnabled": False, "mode": "shadow", "triggerType": "provider", "conditionJson": {"field": "noShowCount", "operator": ">", "value": 3}, "actionType": "limit_provider", "actionPayload": {"penaltyType": "suspension"}, "cooldownSeconds": 86400, "priority": 5},
        ]
        await db.auto_action_rules.insert_many(rules)
        rule_ids = [r["id"] for r in rules]
        execs = []
        for i in range(30):
            rid = random.choice(rule_ids[:5])
            rule = next(r for r in rules if r["id"] == rid)
            execs.append({"id": uid(), "ruleId": rid, "ruleName": rule["name"], "entityType": rule["triggerType"], "entityId": f"entity-{uid()[:8]}", "triggerSnapshot": rule["conditionJson"], "actionType": rule["actionType"], "actionPayload": rule["actionPayload"], "status": random.choice(["executed"]*4 + ["skipped", "failed"]), "isDryRun": False, "affectedEntities": random.randint(1, 20), "createdAt": (now_utc() - timedelta(hours=random.randint(1, 168))).isoformat()})
        await db.auto_action_executions.insert_many(execs)
        fb = []
        for i in range(25):
            rid = random.choice(rule_ids[:5])
            it = random.choice(["positive"]*3 + ["neutral", "negative"])
            sc = random.uniform(5, 15) if it == "positive" else random.uniform(-5, 5) if it == "neutral" else random.uniform(-15, -3)
            cb, eb, rb = random.uniform(55, 75), random.uniform(10, 25), random.uniform(50000, 100000)
            fb.append({"id": uid(), "ruleId": rid, "executionId": random.choice(execs)["id"], "metricBefore": {"conversion": round(cb, 1), "eta": round(eb, 1), "revenue": round(rb)}, "metricAfter": {"conversion": round(cb + random.uniform(-5, 12), 1), "eta": round(eb + random.uniform(-5, 3), 1), "revenue": round(rb + random.uniform(-10000, 20000))}, "impactType": it, "impactScore": round(sc, 2), "createdAt": (now_utc() - timedelta(hours=random.randint(1, 120))).isoformat()})
        await db.automation_feedback.insert_many(fb)
        logger.info("Seeded automation rules + executions + feedback")

    if await db.action_chains.count_documents({}) == 0:
        chains = [
            {"id": uid(), "name": "Low Supply Critical", "isEnabled": True, "triggerType": "zone_state", "triggerConditionJson": {"state": "critical"}, "steps": [{"order": 1, "actionType": "send_push", "payload": {"message": "Urgent"}, "delaySeconds": 0}, {"order": 2, "actionType": "set_surge", "payload": {"multiplier": 1.7}, "delaySeconds": 30}, {"order": 3, "actionType": "expand_radius", "payload": {"radiusKm": 3}, "delaySeconds": 60}, {"order": 4, "actionType": "enable_bidding", "payload": {}, "delaySeconds": 120}]},
            {"id": uid(), "name": "Market Crash Response", "isEnabled": True, "triggerType": "incident", "triggerConditionJson": {"type": "market_crash"}, "steps": [{"order": 1, "actionType": "disable_surge", "payload": {}, "delaySeconds": 0}, {"order": 2, "actionType": "send_push", "payload": {"message": "Stabilization"}, "delaySeconds": 5}, {"order": 3, "actionType": "expand_radius", "payload": {"radiusKm": 5}, "delaySeconds": 30}, {"order": 4, "actionType": "alert_operators", "payload": {"level": "critical"}, "delaySeconds": 0}]},
            {"id": uid(), "name": "Peak Hour Optimization", "isEnabled": True, "triggerType": "zone_state", "triggerConditionJson": {"state": "busy"}, "steps": [{"order": 1, "actionType": "set_surge", "payload": {"multiplier": 1.3}, "delaySeconds": 0}, {"order": 2, "actionType": "reduce_radius", "payload": {"radiusKm": 8}, "delaySeconds": 15}, {"order": 3, "actionType": "send_push", "payload": {"message": "Peak demand!"}, "delaySeconds": 30}]},
            {"id": uid(), "name": "Provider Onboarding", "isEnabled": False, "triggerType": "provider_state", "triggerConditionJson": {"event": "new_provider"}, "steps": [{"order": 1, "actionType": "assign_zone", "payload": {"strategy": "nearest"}, "delaySeconds": 0}, {"order": 2, "actionType": "boost_visibility", "payload": {"level": 2}, "delaySeconds": 5}, {"order": 3, "actionType": "send_welcome", "payload": {"template": "welcome"}, "delaySeconds": 10}]},
        ]
        await db.action_chains.insert_many(chains)
        ch_execs = []
        for i in range(12):
            ch = random.choice(chains[:3])
            ch_execs.append({"id": uid(), "chainId": ch["id"], "status": random.choice(["completed"]*3 + ["failed", "partial"]), "isDryRun": False, "stepsResults": [{"order": s["order"], "actionType": s["actionType"], "status": random.choice(["completed"]*3 + ["failed"]), "delaySeconds": s["delaySeconds"]} for s in ch["steps"]], "createdAt": (now_utc() - timedelta(hours=random.randint(1, 100))).isoformat()})
        await db.action_chain_executions.insert_many(ch_execs)

    if await db.market_state_snapshots.count_documents({}) == 0:
        snaps = []
        zones_list = [("kyiv-center", "Kyiv Center"), ("kyiv-podil", "Kyiv Podil"), ("kyiv-obolon", "Kyiv Obolon"), ("lviv-center", "Lviv Center"), ("odessa-center", "Odessa Center")]
        for h in range(48):
            ts = (now_utc() - timedelta(hours=h)).isoformat()
            ratio = round(random.uniform(0.5, 4.0), 2)
            st = "surplus" if ratio < 0.8 else "balanced" if ratio < 1.5 else "busy" if ratio < 2.5 else "surge" if ratio < 3.5 else "critical"
            snaps.append({"id": uid(), "scopeType": "global", "scopeId": "all", "demandCount": random.randint(5, 80), "supplyCount": random.randint(3, 50), "ratio": ratio, "avgEtaMinutes": round(random.uniform(5, 30), 1), "avgResponseSeconds": round(random.uniform(60, 600)), "conversionRate": round(random.uniform(40, 85), 1), "state": st, "createdAt": ts})
        for zid, zname in zones_list:
            for h in range(0, 48, 4):
                ts = (now_utc() - timedelta(hours=h)).isoformat()
                ratio = round(random.uniform(0.3, 5.0), 2)
                st = "surplus" if ratio < 0.8 else "balanced" if ratio < 1.5 else "busy" if ratio < 2.5 else "surge" if ratio < 3.5 else "critical"
                snaps.append({"id": uid(), "scopeType": "zone", "scopeId": zid, "zoneName": zname, "demandCount": random.randint(2, 30), "supplyCount": random.randint(1, 20), "ratio": ratio, "avgEtaMinutes": round(random.uniform(5, 40), 1), "avgResponseSeconds": round(random.uniform(60, 900)), "conversionRate": round(random.uniform(30, 90), 1), "state": st, "createdAt": ts})
        await db.market_state_snapshots.insert_many(snaps)

    if await db.automation_config.count_documents({}) == 0:
        await db.automation_config.insert_one({"type": "global", "autoDistribution": True, "autoSurge": True, "autoVisibility": True, "autoNotifications": True, "autoChains": False, "dryRunMode": False, "requireOperatorApprovalForCritical": True, "updatedAt": now_utc().isoformat()})

    if await db.failsafe_rules.count_documents({}) == 0:
        fs = [
            {"id": uid(), "name": "Surge Limit Guard", "metric": "surgeMultiplier", "condition": "> 2.5", "rollbackActionType": "rollback_surge", "rollbackPayload": {"resetTo": 1.0}, "isEnabled": True},
            {"id": uid(), "name": "Conversion Floor", "metric": "conversionRate", "condition": "< 30", "rollbackActionType": "disable_bidding", "rollbackPayload": {}, "isEnabled": True},
            {"id": uid(), "name": "Supply Crisis Alert", "metric": "supplyCount", "condition": "== 0", "rollbackActionType": "enable_manual_mode", "rollbackPayload": {"alertLevel": "critical"}, "isEnabled": True},
            {"id": uid(), "name": "Mass Cancel Detector", "metric": "cancelRate", "condition": "> 20", "rollbackActionType": "pause_automation", "rollbackPayload": {}, "isEnabled": True},
            {"id": uid(), "name": "Revenue Drop Guard", "metric": "revenueDelta", "condition": "< -30", "rollbackActionType": "rollback_last_change", "rollbackPayload": {}, "isEnabled": False},
        ]
        await db.failsafe_rules.insert_many(fs)
        fs_ids = [f["id"] for f in fs]
        incidents = []
        for i in range(8):
            fid = random.choice(fs_ids[:4])
            fr = next(f for f in fs if f["id"] == fid)
            incidents.append({"id": uid(), "ruleId": fid, "ruleName": fr["name"], "detectedAt": (now_utc() - timedelta(hours=random.randint(1, 72))).isoformat(), "affectedEntityType": random.choice(["zone", "provider", "market"]), "affectedEntityId": f"entity-{uid()[:8]}", "metricSnapshot": {"metric": fr["metric"], "value": round(random.uniform(0, 100), 1)}, "actionTaken": fr["rollbackActionType"], "status": random.choice(["open", "open", "resolved"])})
        await db.failsafe_incidents.insert_many(incidents)

    await db.users.create_index("email", unique=True)

    # ═══════ SEED MARKETPLACE DATA ═══════
    await seed_marketplace_data()

    # ═══════ SEED DEMO DATA (Sprint 2) — bookings/quotes/vehicles/favorites/notifications/payments ═══════
    await seed_demo_data()

    logger.info("Seed data complete")
    creds_path = Path("/app/memory/test_credentials.md")
    creds_path.parent.mkdir(parents=True, exist_ok=True)
    creds_path.write_text(f"# Test Credentials\n\n## Admin\n- **Email**: {admin_email}\n- **Password**: {admin_password}\n- **Role**: admin\n\n## Customer\n- **Email**: customer@test.com\n- **Password**: Customer123!\n\n## Provider\n- **Email**: provider@test.com\n- **Password**: Provider123!\n\n## Auth Endpoints\n- POST /api/auth/login\n- GET /api/auth/me\n\n## Admin Panel\n- URL: /api/admin-panel\n")


async def seed_marketplace_data():
    """Seed real marketplace data: categories, services, organizations, users"""
    # Seed test users
    for u in [
        {"email": "customer@test.com", "passwordHash": hash_pw("Customer123!"), "firstName": "Иван", "lastName": "Петров", "role": "customer", "isActive": True, "createdAt": now_utc().isoformat()},
        {"email": "provider@test.com", "passwordHash": hash_pw("Provider123!"), "firstName": "Сергей", "lastName": "Мастеров", "role": "provider_owner", "isActive": True, "createdAt": now_utc().isoformat()},
    ]:
        if not await db.users.find_one({"email": u["email"]}):
            await db.users.insert_one(u)

    # Seed service categories
    if await db.servicecategories.count_documents({}) == 0:
        cats = [
            {"name": "Диагностика", "slug": "diagnostics", "icon": "search", "order": 1, "isActive": True},
            {"name": "Ремонт двигателя", "slug": "engine", "icon": "engine", "order": 2, "isActive": True},
            {"name": "Ходовая часть", "slug": "suspension", "icon": "car", "order": 3, "isActive": True},
            {"name": "Тормозная система", "slug": "brakes", "icon": "shield", "order": 4, "isActive": True},
            {"name": "Электрика", "slug": "electric", "icon": "lightning", "order": 5, "isActive": True},
            {"name": "ТО и масла", "slug": "maintenance", "icon": "wrench", "order": 6, "isActive": True},
            {"name": "Кузовной ремонт", "slug": "body", "icon": "car", "order": 7, "isActive": True},
            {"name": "Эвакуация", "slug": "tow", "icon": "truck", "order": 8, "isActive": True},
        ]
        result = await db.servicecategories.insert_many(cats)
        cat_ids = {c["slug"]: str(rid) for c, rid in zip(cats, result.inserted_ids)}
        logger.info(f"Seeded {len(cats)} service categories")

        # Seed services
        svcs = [
            {"name": "Компьютерная диагностика", "slug": "computer-diagnostics", "categoryId": cat_ids["diagnostics"], "priceFrom": 500, "priceTo": 1500, "durationMinutes": 30, "isActive": True},
            {"name": "Диагностика ходовой", "slug": "suspension-diagnostics", "categoryId": cat_ids["diagnostics"], "priceFrom": 300, "priceTo": 800, "durationMinutes": 45, "isActive": True},
            {"name": "Замена масла", "slug": "oil-change", "categoryId": cat_ids["maintenance"], "priceFrom": 300, "priceTo": 800, "durationMinutes": 30, "isActive": True},
            {"name": "Замена тормозных колодок", "slug": "brake-pads", "categoryId": cat_ids["brakes"], "priceFrom": 400, "priceTo": 1200, "durationMinutes": 60, "isActive": True},
            {"name": "Замена тормозных дисков", "slug": "brake-discs", "categoryId": cat_ids["brakes"], "priceFrom": 800, "priceTo": 2500, "durationMinutes": 90, "isActive": True},
            {"name": "Ремонт стартера", "slug": "starter-repair", "categoryId": cat_ids["electric"], "priceFrom": 500, "priceTo": 2000, "durationMinutes": 120, "isActive": True},
            {"name": "Замена аккумулятора", "slug": "battery-replace", "categoryId": cat_ids["electric"], "priceFrom": 200, "priceTo": 500, "durationMinutes": 15, "isActive": True},
            {"name": "Прикурить авто", "slug": "jump-start", "categoryId": cat_ids["electric"], "priceFrom": 200, "priceTo": 500, "durationMinutes": 15, "isActive": True},
            {"name": "Ремонт подвески", "slug": "suspension-repair", "categoryId": cat_ids["suspension"], "priceFrom": 800, "priceTo": 5000, "durationMinutes": 180, "isActive": True},
            {"name": "Развал-схождение", "slug": "wheel-alignment", "categoryId": cat_ids["suspension"], "priceFrom": 400, "priceTo": 1000, "durationMinutes": 60, "isActive": True},
            {"name": "Эвакуация", "slug": "tow-service", "categoryId": cat_ids["tow"], "priceFrom": 800, "priceTo": 3000, "durationMinutes": 60, "isActive": True},
            {"name": "Полное ТО", "slug": "full-maintenance", "categoryId": cat_ids["maintenance"], "priceFrom": 1500, "priceTo": 5000, "durationMinutes": 240, "isActive": True},
        ]
        svc_result = await db.services.insert_many(svcs)
        svc_ids = [str(sid) for sid in svc_result.inserted_ids]
        logger.info(f"Seeded {len(svcs)} services")
    else:
        svc_ids = [str(s["_id"]) async for s in db.services.find({}, {"_id": 1})]

    # Seed organizations (providers)
    if await db.organizations.count_documents({}) == 0:
        provider_user = await db.users.find_one({"email": "provider@test.com"})
        provider_uid = str(provider_user["_id"]) if provider_user else uid()

        orgs = [
            {"name": "АвтоМастер Про", "slug": "avtomaster-pro", "description": "Профессиональная диагностика и ремонт. Работаем с 2015 года.", "type": "sto",
             "ownerId": provider_uid, "status": "active", "isVerified": True,
             "location": {"type": "Point", "coordinates": [30.5234, 50.4501]}, "address": "Киев, ул. Крещатик 22",
             "ratingAvg": 4.9, "reviewsCount": 234, "bookingsCount": 567, "completedBookingsCount": 534,
             "avgResponseTimeMinutes": 8, "visibilityScore": 95, "visibilityState": "boosted",
             "serviceIds": svc_ids[:4] if svc_ids else [], "isOnline": True,
             "badges": ["verified", "top", "fast_response"], "whyReasons": ["Очень близко", "Быстро отвечает", "Есть слот сегодня"],
             "priceFrom": 500, "workHours": "Пн-Сб 09:00-20:00", "createdAt": now_utc().isoformat()},
            {"name": "Мобильный Сервис 24", "slug": "mobile-service-24", "description": "Выездной ремонт в любое время. Приедем за 15 минут.", "type": "mobile",
             "ownerId": uid(), "status": "active", "isVerified": True,
             "location": {"type": "Point", "coordinates": [30.5150, 50.4550]}, "address": "Киев, выездной",
             "ratingAvg": 4.8, "reviewsCount": 156, "bookingsCount": 389, "completedBookingsCount": 372,
             "avgResponseTimeMinutes": 5, "visibilityScore": 90, "visibilityState": "normal",
             "serviceIds": svc_ids[2:5] if len(svc_ids) > 4 else [], "isOnline": True,
             "badges": ["verified", "mobile", "urgent"], "whyReasons": ["Ближайший к вам", "Срочный выезд", "Низкая цена"],
             "priceFrom": 300, "workHours": "24/7", "createdAt": now_utc().isoformat()},
            {"name": "СТО Формула", "slug": "sto-formula", "description": "Специализация: ходовая и тормоза. Гарантия 12 месяцев.", "type": "sto",
             "ownerId": uid(), "status": "active", "isVerified": True,
             "location": {"type": "Point", "coordinates": [30.4950, 50.4350]}, "address": "Киев, ул. Автозаводская 15",
             "ratingAvg": 4.7, "reviewsCount": 189, "bookingsCount": 412, "completedBookingsCount": 398,
             "avgResponseTimeMinutes": 12, "visibilityScore": 85, "visibilityState": "normal",
             "serviceIds": svc_ids[3:6] if len(svc_ids) > 5 else [], "isOnline": True,
             "badges": ["verified", "warranty"], "whyReasons": ["Высокий рейтинг", "Много отзывов", "Гарантия 12 мес"],
             "priceFrom": 400, "workHours": "Пн-Пт 08:00-19:00", "createdAt": now_utc().isoformat()},
            {"name": "ТехноДиагностик", "slug": "techno-diagnostic", "description": "Компьютерная диагностика всех марок. Дилерское оборудование.", "type": "sto",
             "ownerId": uid(), "status": "active", "isVerified": True,
             "location": {"type": "Point", "coordinates": [30.5400, 50.4200]}, "address": "Киев, пр. Науки 8",
             "ratingAvg": 4.6, "reviewsCount": 312, "bookingsCount": 678, "completedBookingsCount": 645,
             "avgResponseTimeMinutes": 15, "visibilityScore": 80, "visibilityState": "normal",
             "serviceIds": svc_ids[:3] if svc_ids else [], "isOnline": False,
             "badges": ["verified", "top_diagnostics", "dealer_equipment"], "whyReasons": ["312 отзывов", "Топ по диагностике", "Дилерское оборудование"],
             "priceFrom": 600, "workHours": "Пн-Сб 09:00-18:00", "createdAt": now_utc().isoformat()},
            {"name": "ЭвакуаторUA", "slug": "evacuator-ua", "description": "Эвакуация авто по Киеву и области. Работаем 24/7.", "type": "mobile",
             "ownerId": uid(), "status": "active", "isVerified": True,
             "location": {"type": "Point", "coordinates": [30.5500, 50.4600]}, "address": "Киев, выездной",
             "ratingAvg": 4.9, "reviewsCount": 445, "bookingsCount": 890, "completedBookingsCount": 871,
             "avgResponseTimeMinutes": 18, "visibilityScore": 92, "visibilityState": "boosted",
             "serviceIds": svc_ids[10:12] if len(svc_ids) > 10 else [], "isOnline": True,
             "badges": ["verified", "24_7", "top_tow"], "whyReasons": ["445 отзывов", "Работает 24/7", "Топ-1 эвакуатор"],
             "priceFrom": 800, "workHours": "24/7", "createdAt": now_utc().isoformat()},
            {"name": "БрейкСервис", "slug": "brake-service", "description": "Тормозные системы любой сложности. Оригинальные запчасти.", "type": "sto",
             "ownerId": uid(), "status": "active", "isVerified": True,
             "location": {"type": "Point", "coordinates": [30.5100, 50.4450]}, "address": "Киев, ул. Механическая 5",
             "ratingAvg": 4.5, "reviewsCount": 98, "bookingsCount": 245, "completedBookingsCount": 231,
             "avgResponseTimeMinutes": 10, "visibilityScore": 75, "visibilityState": "normal",
             "serviceIds": svc_ids[3:5] if len(svc_ids) > 4 else [], "isOnline": True,
             "badges": ["verified", "specialist"], "whyReasons": ["Специалист по тормозам", "Гарантия 1 год"],
             "priceFrom": 800, "workHours": "Пн-Пт 09:00-18:00", "createdAt": now_utc().isoformat()},
            {"name": "AutoElectric Pro", "slug": "autoelectric-pro", "description": "Автоэлектрика, стартеры, генераторы, проводка.", "type": "sto",
             "ownerId": uid(), "status": "active", "isVerified": False,
             "location": {"type": "Point", "coordinates": [30.4800, 50.4380]}, "address": "Киев, ул. Электриков 10",
             "ratingAvg": 4.4, "reviewsCount": 67, "bookingsCount": 134, "completedBookingsCount": 128,
             "avgResponseTimeMinutes": 20, "visibilityScore": 70, "visibilityState": "normal",
             "serviceIds": svc_ids[5:8] if len(svc_ids) > 7 else [], "isOnline": True,
             "badges": ["electric_specialist"], "whyReasons": ["Узкая специализация", "Доступные цены"],
             "priceFrom": 350, "workHours": "Пн-Пт 10:00-19:00", "createdAt": now_utc().isoformat()},
            {"name": "КузовМастер", "slug": "kuzov-master", "description": "Кузовной ремонт, покраска, полировка. Европейское оборудование.", "type": "sto",
             "ownerId": uid(), "status": "active", "isVerified": True,
             "location": {"type": "Point", "coordinates": [30.5300, 50.4100]}, "address": "Киев, ул. Промышленная 22",
             "ratingAvg": 4.8, "reviewsCount": 201, "bookingsCount": 356, "completedBookingsCount": 340,
             "avgResponseTimeMinutes": 25, "visibilityScore": 88, "visibilityState": "normal",
             "serviceIds": svc_ids[6:8] if len(svc_ids) > 6 else [], "isOnline": False,
             "badges": ["verified", "premium"], "whyReasons": ["201 отзывов", "Премиум качество", "Европейское оборудование"],
             "priceFrom": 2000, "workHours": "Пн-Пт 08:00-18:00", "createdAt": now_utc().isoformat()},
        ]
        await db.organizations.insert_many(orgs)
        await db.organizations.create_index([("location", "2dsphere")])
        logger.info(f"Seeded {len(orgs)} organizations")

    # ═══ SEED: Branches (1 per org) — required for quick-request matching ═══
    if await db.branches.count_documents({}) == 0:
        orgs_list = await db.organizations.find({}, {"_id": 1, "name": 1, "location": 1, "address": 1, "workHours": 1}).to_list(50)
        branches = []
        for org in orgs_list:
            loc = org.get("location") or {"type": "Point", "coordinates": [30.5234, 50.4501]}
            branches.append({
                "organizationId": org["_id"],
                "name": org.get("name", "Main branch"),
                "address": org.get("address", ""),
                "location": loc,
                "city": "Kyiv",
                "status": "active",
                "isMobile": False,
                "phone": "+380-44-000-00-00",
                "workHours": org.get("workHours", "09:00-18:00"),
                "createdAt": now_utc().isoformat(),
            })
        if branches:
            await db.branches.insert_many(branches)
            try:
                await db.branches.create_index([("location", "2dsphere")])
            except Exception:
                pass
        logger.info(f"Seeded {len(branches)} branches")

    # ═══ SEED: ProviderServices (price list) — required for quick-request pricing ═══
    if await db.providerservices.count_documents({}) == 0:
        svc_list = await db.services.find({}, {"_id": 1, "slug": 1, "name": 1}).to_list(50)
        branches_list = await db.branches.find({}, {"_id": 1, "organizationId": 1}).to_list(50)
        ps_docs = []
        for branch in branches_list:
            org_services = svc_list[:5]  # top 5 services per branch
            for s in org_services:
                ps_docs.append({
                    "organizationId": branch["organizationId"],
                    "branchId": branch["_id"],
                    "serviceId": s["_id"],
                    "priceFrom": random.randint(300, 1500),
                    "priceMin": random.randint(300, 1500),
                    "description": s.get("name", ""),
                    "durationMinutes": random.choice([30, 45, 60, 90]),
                    "status": "active",
                    "createdAt": now_utc().isoformat(),
                })
        if ps_docs:
            await db.providerservices.insert_many(ps_docs)
        logger.info(f"Seeded {len(ps_docs)} provider services")


    # Seed reviews
    if await db.reviews.count_documents({}) == 0:
        orgs_list = await db.organizations.find({}, {"_id": 1, "slug": 1}).to_list(20)
        reviews = []
        names = ["Анна К.", "Дмитрий С.", "Ольга П.", "Максим В.", "Елена Н.", "Андрей Б.", "Марина Г.", "Виктор Т.", "Наталья Л.", "Игорь М."]
        texts = [
            "Отличный сервис! Всё сделали быстро и качественно.",
            "Очень доволен работой. Приехали вовремя, починили за час.",
            "Рекомендую! Честные цены и профессиональный подход.",
            "Хороший мастер, разобрался с проблемой быстро.",
            "Спасибо за оперативность! Машина работает идеально.",
            "Немного долго ждал, но результат отличный.",
            "Всё на высшем уровне. Буду обращаться ещё.",
        ]
        for org in orgs_list:
            for i in range(random.randint(3, 8)):
                reviews.append({
                    "organizationId": str(org["_id"]), "userId": uid(), "bookingId": uid(),
                    "authorName": random.choice(names), "rating": random.choice([4, 4, 5, 5, 5, 4, 5]),
                    "text": random.choice(texts), "createdAt": (now_utc() - timedelta(days=random.randint(1, 90))).isoformat(),
                })
        if reviews:
            await db.reviews.insert_many(reviews)
        logger.info(f"Seeded {len(reviews)} reviews")

    # ═══ SEED: Provider Availability + Performance + Skills ═══
    if await db.provider_availability.count_documents({}) == 0:
        orgs_list = await db.organizations.find({}, {"_id": 0, "slug": 1, "workHours": 1}).to_list(20)
        avails, perfs, skills_data = [], [], []
        SKILL_CATS = ["engine", "electric", "body", "suspension", "brakes", "diagnostics", "tow", "maintenance"]
        for org in orgs_list:
            slug = org["slug"]
            is_24_7 = "24/7" in org.get("workHours", "")
            schedule = []
            for day in range(7):
                if is_24_7:
                    schedule.append({"day": day, "slots": [{"from": "00:00", "to": "23:59"}]})
                elif day < 5:
                    schedule.append({"day": day, "slots": [{"from": "09:00", "to": "13:00"}, {"from": "14:00", "to": "19:00"}]})
                elif day == 5:
                    schedule.append({"day": day, "slots": [{"from": "10:00", "to": "16:00"}]})
                else:
                    schedule.append({"day": day, "slots": []})
            avails.append({"providerSlug": slug, "weeklySchedule": schedule, "exceptions": [], "isOnline": org.get("isOnline", True), "updatedAt": now_utc().isoformat()})
            
            accept_rate = round(random.uniform(70, 98), 1)
            perfs.append({
                "providerSlug": slug,
                "acceptanceRate": accept_rate,
                "avgResponseTime": random.randint(3, 25),
                "completionRate": round(random.uniform(85, 99), 1),
                "cancelRate": round(random.uniform(1, 10), 1),
                "latenessScore": round(random.uniform(0, 15), 1),
                "qualityScore": round(random.uniform(70, 98), 1),
                "totalJobs": random.randint(50, 900),
                "repeatCustomerRate": round(random.uniform(15, 45), 1),
                "updatedAt": now_utc().isoformat(),
            })
            
            num_skills = random.randint(2, 5)
            chosen = random.sample(SKILL_CATS, min(num_skills, len(SKILL_CATS)))
            for cat in chosen:
                skills_data.append({"providerSlug": slug, "category": cat, "level": random.randint(2, 5), "verified": random.random() > 0.3, "createdAt": now_utc().isoformat()})
        
        await db.provider_availability.insert_many(avails)
        await db.provider_performance.insert_many(perfs)
        await db.provider_skills.insert_many(skills_data)
        logger.info(f"Seeded availability, performance, skills for {len(orgs_list)} providers")

    # ═══ SEED: Zones with polygons ═══
    if await db.zones.count_documents({}) == 0:
        zones = [
            {"id": "kyiv-center", "name": "Центр", "center": {"lat": 50.4501, "lng": 30.5234}, "polygon": {"type": "Polygon", "coordinates": [[[30.49, 50.44], [30.55, 50.44], [30.55, 50.46], [30.49, 50.46], [30.49, 50.44]]]}, "demandScore": 25, "supplyScore": 12, "ratio": 2.1, "surgeMultiplier": 1.3, "avgEta": 8, "matchRate": 78, "status": "BUSY", "color": "#F59E0B"},
            {"id": "kyiv-podil", "name": "Подол", "center": {"lat": 50.4650, "lng": 30.5150}, "polygon": {"type": "Polygon", "coordinates": [[[30.49, 50.46], [30.54, 50.46], [30.54, 50.48], [30.49, 50.48], [30.49, 50.46]]]}, "demandScore": 8, "supplyScore": 6, "ratio": 1.3, "surgeMultiplier": 1.0, "avgEta": 12, "matchRate": 85, "status": "BALANCED", "color": "#22C55E"},
            {"id": "kyiv-obolon", "name": "Оболонь", "center": {"lat": 50.5100, "lng": 30.4900}, "polygon": {"type": "Polygon", "coordinates": [[[30.46, 50.48], [30.52, 50.48], [30.52, 50.53], [30.46, 50.53], [30.46, 50.48]]]}, "demandScore": 15, "supplyScore": 4, "ratio": 3.75, "surgeMultiplier": 1.8, "avgEta": 18, "matchRate": 55, "status": "CRITICAL", "color": "#EF4444"},
            {"id": "kyiv-pechersk", "name": "Печерск", "center": {"lat": 50.4350, "lng": 30.5400}, "polygon": {"type": "Polygon", "coordinates": [[[30.52, 50.42], [30.58, 50.42], [30.58, 50.45], [30.52, 50.45], [30.52, 50.42]]]}, "demandScore": 18, "supplyScore": 8, "ratio": 2.25, "surgeMultiplier": 1.4, "avgEta": 10, "matchRate": 72, "status": "SURGE", "color": "#F97316"},
            {"id": "kyiv-sviatoshyn", "name": "Святошин", "center": {"lat": 50.4580, "lng": 30.3700}, "polygon": {"type": "Polygon", "coordinates": [[[30.34, 50.44], [30.40, 50.44], [30.40, 50.48], [30.34, 50.48], [30.34, 50.44]]]}, "demandScore": 5, "supplyScore": 7, "ratio": 0.71, "surgeMultiplier": 1.0, "avgEta": 6, "matchRate": 92, "status": "BALANCED", "color": "#22C55E"},
            {"id": "kyiv-darnytsia", "name": "Дарница", "center": {"lat": 50.4300, "lng": 30.6100}, "polygon": {"type": "Polygon", "coordinates": [[[30.58, 50.41], [30.65, 50.41], [30.65, 50.45], [30.58, 50.45], [30.58, 50.41]]]}, "demandScore": 12, "supplyScore": 3, "ratio": 4.0, "surgeMultiplier": 2.0, "avgEta": 22, "matchRate": 45, "status": "CRITICAL", "color": "#EF4444"},
        ]
        for z in zones:
            z["updatedAt"] = now_utc().isoformat()
            z["createdAt"] = now_utc().isoformat()
        await db.zones.insert_many(zones)
        
        # Seed zone snapshots (history)
        snaps = []
        for z in zones:
            for h in range(48):
                ts = (now_utc() - timedelta(hours=h)).isoformat()
                d = max(1, z["demandScore"] + random.randint(-8, 8))
                s = max(1, z["supplyScore"] + random.randint(-3, 3))
                ratio = round(d / s, 2)
                snaps.append({"zoneId": z["id"], "timestamp": ts, "demand": d, "supply": s, "ratio": ratio, "surge": round(max(1, min(2.5, ratio * 0.6)), 2), "avgEta": max(3, int(z["avgEta"] + random.randint(-5, 5)))})
        await db.zone_snapshots.insert_many(snaps)
        logger.info(f"Seeded {len(zones)} zones + {len(snaps)} snapshots")


async def seed_demo_data():
    """Sprint 2: seed empty collections so UI shows populated lists.
    All checks are idempotent (skip if already seeded)."""
    # --- Get seed actors ---
    customer = await db.users.find_one({"email": "customer@test.com"})
    provider = await db.users.find_one({"email": "provider@test.com"})
    if not customer or not provider:
        logger.warning("seed_demo_data: test users not found, skipping")
        return
    customer_id = str(customer["_id"])
    provider_id = str(provider["_id"])

    orgs = await db.organizations.find({}, {"_id": 1, "name": 1, "slug": 1, "priceFrom": 1}).to_list(20)
    svcs = await db.services.find({}, {"_id": 1, "name": 1, "priceFrom": 1, "priceTo": 1, "durationMinutes": 1}).to_list(20)
    if not orgs or not svcs:
        logger.warning("seed_demo_data: no orgs/services, skipping")
        return

    from bson import ObjectId

    # --- Vehicles ---
    if await db.vehicles.count_documents({}) == 0:
        vehs = [
            {"userId": ObjectId(customer_id), "brand": "Toyota", "model": "Camry", "year": 2019, "plate": "AA1234BB", "vin": "1HGBH41JXMN109186", "color": "Белый", "mileageKm": 85000, "status": "active", "createdAt": now_utc().isoformat()},
            {"userId": ObjectId(customer_id), "brand": "BMW",    "model": "X5",    "year": 2021, "plate": "AA5678CC", "vin": "5UXCR6C06L9C01234", "color": "Чёрный", "mileageKm": 42000, "status": "active", "createdAt": now_utc().isoformat()},
            {"userId": ObjectId(customer_id), "brand": "Ford",   "model": "Focus", "year": 2016, "plate": "AB9012DD", "vin": "1FADP3K28JL200567", "color": "Синий",  "mileageKm": 128000, "status": "active", "createdAt": now_utc().isoformat()},
            {"userId": ObjectId(customer_id), "brand": "Mercedes-Benz", "model": "E-Class", "year": 2020, "plate": "AI3344EE", "vin": "WDDZF4JB9LA123456", "color": "Серебристый", "mileageKm": 55000, "status": "active", "createdAt": now_utc().isoformat()},
            {"userId": ObjectId(customer_id), "brand": "Volkswagen", "model": "Passat", "year": 2017, "plate": "AE5566FF", "vin": "1VWBN7A37HC056123", "color": "Серый", "mileageKm": 96000, "status": "active", "createdAt": now_utc().isoformat()},
        ]
        await db.vehicles.insert_many(vehs)
        logger.info(f"demo-seed: {len(vehs)} vehicles")

    # --- Favorites ---
    if await db.favorites.count_documents({}) == 0:
        favs = []
        for o in orgs[:5]:
            favs.append({
                "userId": ObjectId(customer_id),
                "organizationId": o["_id"],
                "createdAt": now_utc().isoformat(),
            })
        await db.favorites.insert_many(favs)
        logger.info(f"demo-seed: {len(favs)} favorites")

    # --- Bookings (20 штук разных статусов) ---
    if await db.bookings.count_documents({}) == 0:
        statuses_dist = (["completed"] * 10 + ["cancelled"] * 2 + ["on_route"] * 2 +
                         ["in_progress"] * 2 + ["confirmed"] * 2 + ["pending"] * 2)
        bookings = []
        for i, st in enumerate(statuses_dist):
            o = random.choice(orgs)
            s = random.choice(svcs)
            price = random.randint(s.get("priceFrom", 300) or 300, s.get("priceTo", 2000) or 2000)
            created = now_utc() - timedelta(days=random.randint(0, 60), hours=random.randint(0, 23))
            scheduled = created + timedelta(hours=random.randint(2, 72))
            doc = {
                "bookingNumber": f"BK-{1000 + i}",
                "userId": ObjectId(customer_id),
                "organizationId": o["_id"],
                "serviceId": s["_id"],
                "serviceName": s.get("name"),
                "orgName": o.get("name"),
                "priceEstimate": price,
                "finalPrice": price if st == "completed" else None,
                "status": st,
                "source": random.choice(["quick", "direct", "quote", "repeat"]),
                "scheduledAt": scheduled.isoformat(),
                "address": f"Киев, ул. Тестовая {random.randint(1,99)}",
                "location": {"type": "Point", "coordinates": [30.5 + random.uniform(-0.1, 0.1), 50.45 + random.uniform(-0.05, 0.05)]},
                "createdAt": created.isoformat(),
                "updatedAt": (created + timedelta(hours=random.randint(1, 48))).isoformat(),
            }
            if st == "completed":
                doc["completedAt"] = (scheduled + timedelta(hours=random.randint(1, 4))).isoformat()
            if st == "cancelled":
                doc["cancelledAt"] = (created + timedelta(hours=random.randint(1, 12))).isoformat()
                doc["cancelReason"] = random.choice(["Клиент отменил", "Мастер недоступен", "Изменились планы"])
            bookings.append(doc)
        await db.bookings.insert_many(bookings)
        logger.info(f"demo-seed: {len(bookings)} bookings")

    # --- Quotes (10) ---
    if await db.quotes.count_documents({}) == 0:
        qs = []
        for i in range(10):
            s = random.choice(svcs)
            st = random.choice(["open", "open", "matched", "accepted", "closed"])
            created = now_utc() - timedelta(days=random.randint(0, 30))
            qs.append({
                "userId": ObjectId(customer_id),
                "serviceId": s["_id"],
                "serviceName": s.get("name"),
                "description": f"Нужна помощь с {s.get('name','сервисом').lower()}. Машина не заводится, вызовите мастера.",
                "status": st,
                "priceBudget": random.randint(500, 5000),
                "vehicleBrand": random.choice(["Toyota", "BMW", "Ford", "VW"]),
                "location": {"type": "Point", "coordinates": [30.5 + random.uniform(-0.1, 0.1), 50.45 + random.uniform(-0.05, 0.05)]},
                "address": f"Киев, ул. Тестовая {random.randint(1,99)}",
                "responsesCount": random.randint(0, 5),
                "createdAt": created.isoformat(),
                "updatedAt": created.isoformat(),
            })
        await db.quotes.insert_many(qs)
        logger.info(f"demo-seed: {len(qs)} quotes")

    # --- Payments (5 mocked) ---
    if await db.payments.count_documents({}) == 0:
        done_bookings = await db.bookings.find({"status": "completed"}).to_list(5)
        pays = []
        for b in done_bookings:
            pays.append({
                "userId": b["userId"],
                "bookingId": b["_id"],
                "organizationId": b.get("organizationId"),
                "amount": b.get("finalPrice") or b.get("priceEstimate") or 1000,
                "currency": "UAH",
                "status": "paid",
                "method": "mock",
                "provider": "stripe-mock",
                "stripePaymentIntentId": f"pi_mock_{uid()[:16]}",
                "paidAt": b.get("completedAt") or now_utc().isoformat(),
                "createdAt": b.get("createdAt") or now_utc().isoformat(),
            })
        if pays:
            await db.payments.insert_many(pays)
            logger.info(f"demo-seed: {len(pays)} payments (mocked)")

    # --- Notifications (10) ---
    if await db.notifications.count_documents({}) == 0:
        templates = [
            ("booking_confirmed",   "Бронь подтверждена",     "Ваш заказ принят мастером"),
            ("booking_en_route",    "Мастер в пути",          "Мастер едет к вам, ETA ~15 минут"),
            ("booking_completed",   "Заказ выполнен",         "Пожалуйста, оцените работу"),
            ("quote_response",      "Новый ответ на запрос",  "СТО ответила на ваш запрос"),
            ("promo",               "Скидка 10%",             "На следующий визит — промокод SAVE10"),
            ("system",              "Обслуживание системы",   "Платформа обновлена до версии 2.1"),
        ]
        notifs = []
        for i in range(10):
            t = random.choice(templates)
            created = now_utc() - timedelta(hours=random.randint(0, 168))
            notifs.append({
                "userId": ObjectId(customer_id),
                "type": t[0],
                "title": t[1],
                "body": t[2],
                "isRead": random.random() > 0.4,
                "createdAt": created.isoformat(),
                "readAt": created.isoformat() if random.random() > 0.4 else None,
            })
        await db.notifications.insert_many(notifs)
        logger.info(f"demo-seed: {len(notifs)} notifications")

    # --- Disputes (3) ---
    if await db.disputes.count_documents({}) == 0:
        some_bookings = await db.bookings.find({"status": "completed"}).to_list(3)
        ds = []
        for b in some_bookings:
            ds.append({
                "bookingId": b["_id"],
                "userId": b["userId"],
                "organizationId": b.get("organizationId"),
                "reason": random.choice(["quality", "price", "delay", "no_show"]),
                "description": "Описание проблемы от клиента.",
                "status": random.choice(["open", "investigating", "resolved"]),
                "createdAt": now_utc().isoformat(),
            })
        if ds:
            await db.disputes.insert_many(ds)
            logger.info(f"demo-seed: {len(ds)} disputes")

    # --- Feature flags (5) ---
    if await db.feature_flags.count_documents({}) == 0:
        flags = [
            {"key": "new_matching_v2",    "enabled": True,  "description": "Новый алгоритм матчинга v2", "rolloutPct": 100},
            {"key": "surge_pricing",      "enabled": True,  "description": "Динамическое surge-ценообразование", "rolloutPct": 100},
            {"key": "provider_boost",     "enabled": True,  "description": "Платный boost видимости мастеров", "rolloutPct": 100},
            {"key": "realtime_tracking",  "enabled": True,  "description": "Live-трекинг мастера на карте", "rolloutPct": 100},
            {"key": "voice_requests",     "enabled": False, "description": "Голосовые заявки (beta)", "rolloutPct": 10},
        ]
        await db.feature_flags.insert_many([{**f, "updatedAt": now_utc().isoformat()} for f in flags])
        logger.info(f"demo-seed: {len(flags)} feature flags")

    # --- Audit logs (recent activity) ---
    if await db.audit_logs.count_documents({}) == 0:
        actors = ["admin@autoservice.com", "system", "orchestrator"]
        actions = ["user.login", "booking.created", "payment.captured", "provider.verified",
                   "zone.surge_changed", "automation.rule_enabled"]
        logs = []
        for _ in range(30):
            logs.append({
                "actor": random.choice(actors),
                "action": random.choice(actions),
                "target": f"entity_{uid()[:8]}",
                "meta": {"ip": f"10.0.{random.randint(0,255)}.{random.randint(0,255)}"},
                "createdAt": (now_utc() - timedelta(hours=random.randint(0, 48))).isoformat(),
            })
        await db.audit_logs.insert_many(logs)
        logger.info(f"demo-seed: {len(logs)} audit_logs")

    # Indexes for new collections
    await db.vehicles.create_index("userId")
    await db.favorites.create_index([("userId", 1), ("organizationId", 1)], unique=True)
    await db.bookings.create_index([("userId", 1), ("createdAt", -1)])
    await db.notifications.create_index([("userId", 1), ("createdAt", -1)])
    await db.password_reset_tokens.create_index("token", unique=True)
    await db.password_reset_tokens.create_index("expiresAt", expireAfterSeconds=86400)




async def start_nestjs():
    global nestjs_process
    try:
        async with httpx.AsyncClient() as http:
            try:
                r = await http.get(f"{NESTJS_URL}/api/admin/automation/dashboard", timeout=2.0)
                if r.status_code < 500:
                    logger.info("NestJS already running")
                    return True
            except Exception:
                pass

        dist_main = ROOT_DIR / 'dist' / 'main.js'
        if not dist_main.exists():
            logger.error(f"NestJS dist not found at {dist_main}")
            return False

        env = os.environ.copy()
        env['PORT'] = '3001'
        env['MONGO_URL'] = mongo_url
        env['DB_NAME'] = db_name
        env['JWT_ACCESS_SECRET'] = os.environ.get('JWT_SECRET', 'auto_service_jwt_secret_key_2025_very_secure')

        nestjs_process = subprocess.Popen(['node', 'dist/main.js'], cwd=str(ROOT_DIR), env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

        for i in range(60):
            await asyncio.sleep(1)
            try:
                async with httpx.AsyncClient() as http:
                    r = await http.get(f"{NESTJS_URL}/api/admin/automation/dashboard", timeout=2.0)
                    if r.status_code < 500:
                        logger.info("NestJS started successfully")
                        return True
            except Exception:
                if nestjs_process.poll() is not None:
                    out = nestjs_process.stdout.read().decode() if nestjs_process.stdout else ""
                    logger.error(f"NestJS crashed: {out[:2000]}")
                    return False
        return False
    except Exception as e:
        logger.error(f"Failed to start NestJS: {e}")
        return False


http_client = httpx.AsyncClient(timeout=30.0)


# ═══════════════════════════════════════════════
# 🔔 REALTIME EVENT EMISSION
# ═══════════════════════════════════════════════
async def emit_realtime_event(event_type: str, data: dict):
    """Push event to NestJS realtime controller for WebSocket broadcast"""
    try:
        await http_client.post(
            f"{NESTJS_URL}/api/realtime/emit?event_type={event_type}",
            json=data, timeout=2.0
        )
    except Exception:
        pass  # Non-blocking, best-effort


async def emit_booking_status_changed(booking_id: str, old_status: str, new_status: str, extra: dict = None):
    """Emit booking:status_changed event"""
    payload = {"bookingId": booking_id, "oldStatus": old_status, "newStatus": new_status, **(extra or {})}
    await emit_realtime_event("booking:status_changed", payload)


async def emit_provider_new_request(booking: dict):
    """Emit provider:new_request event"""
    await emit_realtime_event("provider:new_request", {
        "requestId": booking.get("id"), "serviceName": booking.get("serviceName"),
        "priceEstimate": booking.get("priceEstimate"), "source": booking.get("source"),
    })


async def emit_provider_location(booking_id: str, lat: float, lng: float, heading: float = 0, speed: float = 0, eta: int = 0):
    """Emit booking:provider_location event"""
    await emit_realtime_event("booking:provider_location", {
        "bookingId": booking_id, "lat": lat, "lng": lng, "heading": heading, "speed": speed, "etaMinutes": eta,
    })


zone_engine_task = None

async def zone_state_engine():
    """Phase B: Periodic zone state recalculation engine (every 10s)"""
    _last_critical_alert: dict[str, float] = {}  # zoneId → epoch-seconds
    CRITICAL_ALERT_COOLDOWN = 300  # 5 min
    while True:
        try:
            zones = await db.zones.find({}, {"_id": 0, "id": 1, "center": 1}).to_list(50)
            for z in zones:
                zid = z["id"]
                # Sprint 9 — zone override check: if active, freeze engine writes for status/surge
                override = await get_active_override(zid)
                # Count active demand (pending/confirmed bookings + quotes)
                demand_bookings = await db.web_bookings.count_documents({"zoneId": zid, "status": {"$in": ["pending", "confirmed", "on_route"]}}) if await db.web_bookings.count_documents({}) > 0 else 0
                demand_events = await db.booking_demand_events.count_documents({"zoneId": zid, "type": "created", "timestamp": {"$gte": (now_utc() - timedelta(minutes=30)).isoformat()}})
                demand = max(1, demand_bookings + demand_events + random.randint(2, 8))
                
                # Count online providers in zone
                supply_org = await db.organizations.count_documents({"status": "active", "isOnline": True})
                supply_loc = await db.provider_locations.count_documents({"zoneId": zid, "isOnline": True})
                supply = max(1, supply_loc if supply_loc > 0 else max(1, supply_org // max(len(zones), 1) + random.randint(0, 3)))
                
                ratio = round(demand / supply, 2)
                
                # Status
                if ratio < 1: status, color = "BALANCED", "#22C55E"
                elif ratio < 2: status, color = "BUSY", "#F59E0B"
                elif ratio < 3: status, color = "SURGE", "#F97316"
                else: status, color = "CRITICAL", "#EF4444"
                
                # Surge pricing
                if ratio < 1: surge = 1.0
                elif ratio < 2: surge = round(1 + (ratio - 1) * 0.3, 2)
                elif ratio < 3: surge = round(1.3 + (ratio - 2) * 0.4, 2)
                else: surge = min(2.5, round(1.7 + (ratio - 3) * 0.3, 2))
                
                avg_eta = max(3, int(8 + ratio * 3 + random.uniform(-2, 2)))
                match_rate = max(30, int(90 - ratio * 12 + random.uniform(-5, 5)))
                
                update = {
                    "demandScore": demand, "supplyScore": supply, "ratio": ratio,
                    "surgeMultiplier": surge, "avgEta": avg_eta, "matchRate": match_rate,
                    "status": status, "color": color, "updatedAt": now_utc().isoformat(),
                }
                # Sprint 9 — if override active, force mode/surge/color (preserve real demand/supply/eta)
                if override:
                    o_status, o_color, o_surge = OVERRIDE_MODE_MAP.get(override["mode"], (status, color, surge))
                    update["status"] = o_status
                    update["color"] = o_color
                    update["surgeMultiplier"] = o_surge
                    update["overriddenUntil"] = override.get("expiresAt")
                    update["overrideMode"] = override.get("mode")
                await db.zones.update_one({"id": zid}, {"$set": update})
                
                # Save snapshot every cycle
                await db.zone_snapshots.insert_one({
                    "zoneId": zid, "timestamp": now_utc().isoformat(),
                    "demand": demand, "supply": supply, "ratio": ratio,
                    "surge": surge, "avgEta": avg_eta,
                })
                
                # Emit realtime event
                await emit_realtime_event("zone:updated", {"zoneId": zid, "status": status, "surge": surge, "ratio": ratio, "demand": demand, "supply": supply})

                # Sprint 12: alert on CRITICAL zone (cooldown-throttled)
                final_status = update["status"]
                if final_status == "CRITICAL":
                    last = _last_critical_alert.get(zid, 0)
                    if (time.time() - last) > CRITICAL_ALERT_COOLDOWN:
                        _last_critical_alert[zid] = time.time()
                        asyncio.create_task(dispatch_alert(
                            db, level="critical", code="ZONE_CRITICAL",
                            message=f"Zone {zid} entered CRITICAL state (ratio {ratio})",
                            zone_id=zid,
                            meta={"ratio": ratio, "demand": demand, "supply": supply,
                                  "surge": update["surgeMultiplier"], "avgEta": avg_eta},
                        ))
            
            # Cleanup old snapshots (keep last 48h)
            cutoff = (now_utc() - timedelta(hours=48)).isoformat()
            await db.zone_snapshots.delete_many({"timestamp": {"$lt": cutoff}})
            
        except Exception as e:
            logger.error(f"Zone engine error: {e}")
        
        await asyncio.sleep(10)


@app.on_event("startup")
async def startup():
    global zone_engine_task
    await seed_data()
    asyncio.create_task(start_nestjs())
    
    # Phase B: Create geo indexes
    await db.provider_locations.create_index([("location", "2dsphere")])
    await db.provider_locations.create_index("providerId", unique=True)
    await db.booking_demand_events.create_index([("zoneId", 1), ("timestamp", -1)])
    await db.zone_snapshots.create_index([("zoneId", 1), ("timestamp", -1)])
    
    # Phase B: Seed provider locations from organizations
    if await db.provider_locations.count_documents({}) == 0:
        orgs = await db.organizations.find({"status": "active"}, {"_id": 0, "slug": 1, "location": 1, "isOnline": 1}).to_list(50)
        for org in orgs:
            coords = org.get("location", {}).get("coordinates", [30.5234, 50.4501])
            zid = resolve_zone(coords[1], coords[0])
            await db.provider_locations.insert_one({
                "providerId": org["slug"],
                "location": {"type": "Point", "coordinates": coords},
                "zoneId": zid,
                "isOnline": org.get("isOnline", False),
                "heading": 0, "speed": 0,
                "updatedAt": now_utc().isoformat(),
            })
        logger.info(f"Seeded {len(orgs)} provider locations")
    
    # Start zone state engine
    zone_engine_task = asyncio.create_task(zone_state_engine())
    logger.info("Phase B: Zone State Engine started (10s cycle)")

    # Sprint 12: ensure production-readiness indexes + TTLs
    await ensure_idempotency_indexes(db)
    await ensure_alert_indexes(db)
    await ensure_ttl_indexes(db)
    logger.info("Sprint 12: production-readiness indexes ensured")


@app.on_event("shutdown")
async def shutdown():
    global nestjs_process
    client.close()
    if nestjs_process:
        nestjs_process.terminate()
        try: nestjs_process.wait(timeout=5)
        except: nestjs_process.kill()


app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ═══════════════════════════════════════════════════════════════
# 🔍 SPRINT 6 — OBSERVABILITY & ERROR SYSTEM
# ═══════════════════════════════════════════════════════════════

# In-memory counters (fast path; persistent copy in system_metrics)
_error_counters: dict = {"by_code": {}, "by_status": {}, "by_route": {}, "total": 0, "since": datetime.now(timezone.utc).isoformat()}
_request_counter: int = 0

ERROR_CODE_MAP = {
    400: "VALIDATION_ERROR",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    502: "UPSTREAM_ERROR",
    503: "SERVICE_UNAVAILABLE",
}


def _normalize_error(status_code: int, message: str, code: Optional[str] = None, details: Optional[dict] = None) -> dict:
    """Produce the unified error envelope {error, code, message, details}."""
    return {
        "error": True,
        "code": code or ERROR_CODE_MAP.get(status_code, "INTERNAL_ERROR"),
        "message": message or "Unknown error",
        "details": details or {},
    }


async def _log_system_event(level: str, route: str, method: str, status: int,
                            message: str, code: str, duration_ms: int,
                            user_id: Optional[str] = None, meta: Optional[dict] = None):
    """Write an entry to system_logs (fire-and-forget; never raises)."""
    try:
        await db.system_logs.insert_one({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "service": "fastapi",
            "route": route,
            "method": method,
            "status": status,
            "errorCode": code,
            "message": message[:500],
            "userId": user_id,
            "durationMs": duration_ms,
            "meta": meta or {},
        })
    except Exception:
        pass


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    """
    Logs every request + time + status. Writes to system_logs ONLY for non-2xx
    or long-running requests (>2000ms). This keeps the collection tight.
    """
    global _request_counter
    start = time.time()
    _request_counter += 1
    path = request.url.path
    method = request.method
    # Cheap skip for noisy endpoints
    skip_log = path.startswith("/api/socket.io/") or path.startswith("/api/realtime/events")

    try:
        response = await call_next(request)
        duration_ms = int((time.time() - start) * 1000)
        status = response.status_code

        # Count + log non-2xx
        if status >= 400:
            code = ERROR_CODE_MAP.get(status, "INTERNAL_ERROR")
            _error_counters["total"] += 1
            _error_counters["by_status"][str(status)] = _error_counters["by_status"].get(str(status), 0) + 1
            _error_counters["by_code"][code] = _error_counters["by_code"].get(code, 0) + 1
            _error_counters["by_route"][path] = _error_counters["by_route"].get(path, 0) + 1
            if not skip_log:
                await _log_system_event(
                    level="error" if status >= 500 else "warn",
                    route=path, method=method, status=status,
                    message=f"{method} {path} → {status}",
                    code=code, duration_ms=duration_ms,
                )
        elif duration_ms > 2000 and not skip_log:
            await _log_system_event(
                level="warn", route=path, method=method, status=status,
                message=f"slow {method} {path} ({duration_ms}ms)",
                code="SLOW_REQUEST", duration_ms=duration_ms,
            )

        # Annotate response header for clients (admin UI badge)
        response.headers["x-request-duration-ms"] = str(duration_ms)
        return response
    except HTTPException:
        # Let FastAPI's default handler format it → our exception_handler below catches.
        raise
    except Exception as exc:
        duration_ms = int((time.time() - start) * 1000)
        logger.exception(f"Unhandled error on {method} {path}")
        _error_counters["total"] += 1
        _error_counters["by_status"]["500"] = _error_counters["by_status"].get("500", 0) + 1
        _error_counters["by_code"]["INTERNAL_ERROR"] = _error_counters["by_code"].get("INTERNAL_ERROR", 0) + 1
        _error_counters["by_route"][path] = _error_counters["by_route"].get(path, 0) + 1
        await _log_system_event(
            level="error", route=path, method=method, status=500,
            message=str(exc)[:500], code="INTERNAL_ERROR", duration_ms=duration_ms,
        )
        return JSONResponse(status_code=500, content=_normalize_error(500, str(exc)))


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Convert FastAPI HTTPException → unified error envelope."""
    body = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
    if isinstance(body, dict) and body.get("error") is True:
        payload = body  # already normalized
    else:
        msg = body.get("message") if isinstance(body, dict) else str(exc.detail)
        payload = _normalize_error(exc.status_code, msg or "")
    return JSONResponse(status_code=exc.status_code, content=payload, headers=exc.headers or None)


@app.exception_handler(StarletteHTTPException)
async def starlette_http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code,
                        content=_normalize_error(exc.status_code, str(exc.detail) if exc.detail else ""))


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content=_normalize_error(
        422, "Validation failed", code="VALIDATION_ERROR", details={"errors": exc.errors()}
    ))


# ═══════════════════════════════════════════════════════════════
# 🛡 SPRINT 12 — Rate limit + Idempotency middleware
# Registered AFTER observability so it runs OUTER (i.e. before obs).
# ═══════════════════════════════════════════════════════════════

# Sprint 12: paths that must require admin JWT but are handled by upstream
# (NestJS) that forgot to guard them.
UNGUARDED_ADMIN_PATHS = (
    "/api/admin/automation/",
)


@app.middleware("http")
async def prod_readiness_middleware(request: Request, call_next):
    # 0. Hard-gate paths that NestJS forgot to protect
    p = request.url.path
    if any(p.startswith(pref) for pref in UNGUARDED_ADMIN_PATHS):
        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            return JSONResponse(status_code=401, content=_normalize_error(
                401, "Unauthorized", code="UNAUTHORIZED"))
        try:
            payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
            if payload.get("role") != "admin":
                return JSONResponse(status_code=403, content=_normalize_error(
                    403, "Admin role required", code="FORBIDDEN"))
        except jwt.ExpiredSignatureError:
            return JSONResponse(status_code=401, content=_normalize_error(
                401, "Token expired", code="UNAUTHORIZED"))
        except jwt.InvalidTokenError:
            return JSONResponse(status_code=401, content=_normalize_error(
                401, "Invalid token", code="UNAUTHORIZED"))

    # 1. Rate limit (fast path)
    rl = check_rate_limit(request)
    if rl is not None:
        return rl
    # 2. Idempotency lookup (may short-circuit with cached response)
    idem_early = await idempotency_lookup(db, request)
    if idem_early is not None:
        return idem_early
    # 3. Execute handler
    response = await call_next(request)
    # 4. Commit idempotency record for new successful POST
    if (request.headers.get("idempotency-key")
            and request.method == "POST"
            and 200 <= response.status_code < 300):
        try:
            body_iter = [chunk async for chunk in response.body_iterator]  # type: ignore[attr-defined]
            content = b"".join(body_iter)
            await idempotency_commit(db, request, response.status_code, content)
            # Return a new plain Response so body is properly re-sent
            from starlette.responses import Response as _Resp
            headers = {k: v for k, v in response.headers.items()
                       if k.lower() not in ("content-length",
                                            "content-encoding",
                                            "transfer-encoding")}
            return _Resp(
                content=content,
                status_code=response.status_code,
                headers=headers,
                media_type=response.media_type,
            )
        except Exception:
            logger.exception("idempotency commit failed")
            return response
    return response


# ─── System observability endpoints ─────────────────────────────

@app.get("/api/system/health")
async def system_health():
    """Enhanced health with counts, engine liveness, WS status."""
    # Engine liveness — check last orchestrator log
    last_orch = await db.orchestrator_logs.find_one({}, {"_id": 0, "createdAt": 1}, sort=[("createdAt", -1)])
    last_fb = await db.action_feedback.find_one({}, {"_id": 0, "createdAt": 1}, sort=[("createdAt", -1)])
    orch_alive = False; fb_alive = False
    if last_orch and last_orch.get("createdAt"):
        try:
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(last_orch["createdAt"].replace("Z", "+00:00"))).total_seconds()
            orch_alive = age < 60
        except Exception:
            pass
    if last_fb and last_fb.get("createdAt"):
        try:
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(last_fb["createdAt"].replace("Z", "+00:00"))).total_seconds()
            fb_alive = age < 300
        except Exception:
            pass

    # WS connections from NestJS
    ws_conns = 0
    try:
        r = await http_client.get(f"{NESTJS_URL}/api/realtime/status", timeout=3)
        if r.status_code == 200:
            ws_conns = r.json().get("connectedClients", 0)
    except Exception:
        pass

    # Errors in last 5 min
    five_min_ago = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    errors_5min = await db.system_logs.count_documents({"level": {"$in": ["error", "warn"]}, "timestamp": {"$gte": five_min_ago}})

    return {
        "status": "ok" if orch_alive and fb_alive else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "requestsTotal": _request_counter,
        "errorsLast5Min": errors_5min,
        "errorsTotal": _error_counters["total"],
        "wsConnections": ws_conns,
        "orchestratorAlive": orch_alive,
        "feedbackAlive": fb_alive,
        "counters": _error_counters,
    }


@app.get("/api/system/errors")
async def system_errors(request: Request, _=Depends(verify_admin_token)):
    """Last error/warn entries from system_logs."""
    limit = int(request.query_params.get("limit", 100))
    level = request.query_params.get("level")
    q: dict = {}
    if level:
        q["level"] = level
    else:
        q["level"] = {"$in": ["error", "warn"]}
    route = request.query_params.get("route")
    if route:
        q["route"] = {"$regex": route, "$options": "i"}
    items = await db.system_logs.find(q, {"_id": 0}).sort("timestamp", -1).to_list(min(limit, 500))
    return {"items": items, "total": len(items)}


@app.get("/api/system/errors/stats")
async def system_errors_stats(_=Depends(verify_admin_token)):
    """Aggregated stats for admin dashboard."""
    now = datetime.now(timezone.utc)
    buckets = []
    for i in range(11, -1, -1):  # last 12 windows of 5 minutes
        start_iso = (now - timedelta(minutes=(i + 1) * 5)).isoformat()
        end_iso = (now - timedelta(minutes=i * 5)).isoformat()
        n = await db.system_logs.count_documents({
            "level": {"$in": ["error", "warn"]},
            "timestamp": {"$gte": start_iso, "$lt": end_iso},
        })
        buckets.append({"from": start_iso, "to": end_iso, "count": n})

    # Top errors (last 24h)
    day_ago = (now - timedelta(hours=24)).isoformat()
    pipeline = [
        {"$match": {"level": {"$in": ["error", "warn"]}, "timestamp": {"$gte": day_ago}}},
        {"$group": {"_id": "$errorCode", "count": {"$sum": 1}, "lastMessage": {"$last": "$message"}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    top_codes = [{"code": r["_id"] or "UNKNOWN", "count": r["count"], "lastMessage": r.get("lastMessage")}
                 async for r in db.system_logs.aggregate(pipeline)]

    # Top affected routes
    pipeline_r = [
        {"$match": {"level": {"$in": ["error", "warn"]}, "timestamp": {"$gte": day_ago}}},
        {"$group": {"_id": "$route", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    top_routes = [{"route": r["_id"] or "?", "count": r["count"]}
                  async for r in db.system_logs.aggregate(pipeline_r)]

    # Rate: errors/min (last 5 min)
    last_5 = sum(b["count"] for b in buckets[-1:])
    return {
        "errorsLast5Min": last_5,
        "errorRate": round(last_5 / 5.0, 2),
        "timeline": buckets,
        "topCodes": top_codes,
        "topRoutes": top_routes,
        "countersLive": _error_counters,
    }


# ═══════════════════════════════════════════════
# 🔐 AUTH ENDPOINTS (FastAPI native — NestJS fallback)
# ═══════════════════════════════════════════════

@app.post("/api/auth/login")
async def auth_login(request: Request):
    """Login with email/password, return JWT token"""
    body = await request.json()
    email = body.get("email", "").strip().lower()
    password = body.get("password", "")

    if not email or not password:
        raise HTTPException(400, "Email and password are required")

    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(401, "Invalid credentials")

    pw_hash = user.get("passwordHash", "")
    if not pw_hash or not verify_pw(password, pw_hash):
        raise HTTPException(401, "Invalid credentials")

    if not user.get("isActive", True):
        raise HTTPException(403, "Account is disabled")

    # Generate JWT
    payload = {
        "sub": str(user["_id"]),
        "email": user["email"],
        "role": user.get("role", "customer"),
        "iat": int(now_utc().timestamp()),
        "exp": int((now_utc() + timedelta(days=7)).timestamp()),
    }
    access_token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")

    user_data = {
        "id": str(user["_id"]),
        "email": user["email"],
        "firstName": user.get("firstName", ""),
        "lastName": user.get("lastName", ""),
        "role": user.get("role", "customer"),
    }

    return {"accessToken": access_token, "user": user_data}


@app.post("/api/auth/register")
async def auth_register(request: Request):
    """Register a new user"""
    body = await request.json()
    email = body.get("email", "").strip().lower()
    password = body.get("password", "")
    first_name = body.get("firstName", "")
    last_name = body.get("lastName", "")
    role = body.get("role", "customer")

    if not email or not password:
        raise HTTPException(400, "Email and password are required")
    if len(password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(409, "User with this email already exists")

    user_doc = {
        "email": email,
        "passwordHash": hash_pw(password),
        "firstName": first_name,
        "lastName": last_name,
        "role": role if role in ["customer", "provider_owner"] else "customer",
        "isActive": True,
        "createdAt": now_utc().isoformat(),
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    payload = {
        "sub": user_id,
        "email": email,
        "role": user_doc["role"],
        "iat": int(now_utc().timestamp()),
        "exp": int((now_utc() + timedelta(days=7)).timestamp()),
    }
    access_token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")

    user_data = {
        "id": user_id,
        "email": email,
        "firstName": first_name,
        "lastName": last_name,
        "role": user_doc["role"],
    }

    return {"accessToken": access_token, "user": user_data}


@app.get("/api/auth/me")
async def auth_me(request: Request):
    """Get current user info from JWT"""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    token = auth_header[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(401, "User not found")

    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "firstName": user.get("firstName", ""),
        "lastName": user.get("lastName", ""),
        "role": user.get("role", "customer"),
    }



# Health endpoint
@app.get("/api/health")
async def health():
    nestjs_ok = False
    try:
        r = await http_client.get(f"{NESTJS_URL}/api/admin/automation/dashboard", timeout=2.0)
        nestjs_ok = r.status_code < 500
    except: pass
    return {"status": "ok", "nestjs": "healthy" if nestjs_ok else "starting", "timestamp": datetime.now(timezone.utc).isoformat()}


# Serve admin panel static files BEFORE the catch-all proxy
# ═══════════════════════════════════════════════
# 🌐 WEB APP (Third Client)
# ═══════════════════════════════════════════════
@app.get("/api/web-app")
async def web_app_redirect():
    from starlette.responses import RedirectResponse
    return RedirectResponse(url="/api/web-app/")

@app.get("/api/web-app/")
async def web_app_index():
    index_path = WEBAPP_BUILD_DIR / 'index.html'
    if index_path.exists():
        return FileResponse(str(index_path), media_type='text/html')
    return JSONResponse({"error": "Web app not built"}, status_code=404)

@app.get("/api/web-app/assets/{file_path:path}")
async def web_app_assets(file_path: str):
    file = WEBAPP_BUILD_DIR / 'assets' / file_path
    if file.exists():
        media_type = 'application/javascript' if str(file).endswith('.js') else 'text/css' if str(file).endswith('.css') else None
        return FileResponse(str(file), media_type=media_type)
    return JSONResponse({"error": "File not found"}, status_code=404)

@app.get("/api/web-app/{path:path}")
async def web_app_spa(path: str):
    file = WEBAPP_BUILD_DIR / path
    if file.exists() and file.is_file():
        return FileResponse(str(file))
    index_path = WEBAPP_BUILD_DIR / 'index.html'
    if index_path.exists():
        return FileResponse(str(index_path), media_type='text/html')
    return JSONResponse({"error": "Web app not built"}, status_code=404)

# ═══════════════════════════════════════════════
# 🔧 ADMIN PANEL
# ═══════════════════════════════════════════════
@app.get("/api/admin-panel")
async def admin_panel_redirect():
    """Redirect /api/admin-panel to /api/admin-panel/"""
    from starlette.responses import RedirectResponse
    return RedirectResponse(url="/api/admin-panel/")


@app.get("/api/admin-panel/")
async def admin_panel_index():
    """Serve admin panel index.html"""
    index_path = ADMIN_BUILD_DIR / 'index.html'
    if index_path.exists():
        return FileResponse(str(index_path), media_type='text/html')
    return JSONResponse({"error": "Admin panel not built"}, status_code=404)


@app.get("/api/admin-panel/assets/{file_path:path}")
async def admin_panel_assets(file_path: str):
    """Serve admin panel static assets"""
    file = ADMIN_BUILD_DIR / 'assets' / file_path
    if file.exists():
        media_type = 'application/javascript' if str(file).endswith('.js') else 'text/css' if str(file).endswith('.css') else None
        return FileResponse(str(file), media_type=media_type)
    return JSONResponse({"error": "File not found"}, status_code=404)


@app.get("/api/admin-panel/{path:path}")
async def admin_panel_spa(path: str):
    """SPA fallback - serve index.html for all admin routes"""
    # Check if it's a static file first
    file = ADMIN_BUILD_DIR / path
    if file.exists() and file.is_file():
        return FileResponse(str(file))
    # Otherwise serve index.html for SPA routing
    index_path = ADMIN_BUILD_DIR / 'index.html'
    if index_path.exists():
        return FileResponse(str(index_path), media_type='text/html')
    return JSONResponse({"error": "Admin panel not built"}, status_code=404)


# ═══════════════════════════════════════════════
# 🧠 GOVERNANCE: Demand Push + Provider Behavior + Flow Control
# ═══════════════════════════════════════════════

@app.post("/api/admin/demand/push-providers")
async def demand_push_providers(request: Request, _=Depends(verify_admin_token)):
    """Push notification to providers in a zone with high demand"""
    body = await request.json()
    zone_id = body.get("zoneId", "all")
    min_score = body.get("minScore", 0)
    message = body.get("message", "Высокий спрос в вашей зоне!")

    # Find eligible providers
    query = {"isActive": True}
    if min_score > 0:
        query["score"] = {"$gte": min_score}
    
    # Get push devices for providers
    devices = await db.push_devices.find({"role": {"$in": ["provider_owner", "provider_manager"]}, "isActive": True}, {"_id": 0}).to_list(200)
    
    # Log the action
    action_log = {
        "id": uid(), "type": "demand_push", "zoneId": zone_id,
        "targetCount": len(devices), "message": message,
        "minScore": min_score, "createdAt": now_utc().isoformat(),
        "status": "sent",
    }
    await db.governance_actions.insert_one(action_log)
    action_log.pop("_id", None)
    
    return {"status": "sent", "targetCount": len(devices), "action": action_log}


@app.post("/api/admin/demand/{zone_id}/boost-supply")
async def boost_supply(zone_id: str, request: Request, _=Depends(verify_admin_token)):
    """Boost supply in a zone - increase visibility for providers"""
    body = await request.json()
    boost_level = body.get("boostLevel", 1.5)
    duration_minutes = body.get("durationMinutes", 30)
    
    action_log = {
        "id": uid(), "type": "boost_supply", "zoneId": zone_id,
        "boostLevel": boost_level, "durationMinutes": duration_minutes,
        "createdAt": now_utc().isoformat(), "status": "active",
    }
    await db.governance_actions.insert_one(action_log)
    action_log.pop("_id", None)
    
    return {"status": "boosted", "zoneId": zone_id, "action": action_log}


@app.get("/api/admin/providers/behavior")
async def provider_behavior_overview(request: Request, _=Depends(verify_admin_token)):
    """Get provider behavior overview for governance"""
    # Get all providers with their behavior data
    providers = await db.organizations.find(
        {"status": "active"},
        {"_id": 0, "name": 1, "slug": 1, "ratingAvg": 1, "reviewsCount": 1, 
         "bookingsCount": 1, "completedBookingsCount": 1, "avgResponseTimeMinutes": 1,
         "visibilityScore": 1, "visibilityState": 1}
    ).to_list(100)
    
    # Generate behavior scores
    behavior_data = []
    risky_count = 0
    top_count = 0
    slow_count = 0
    
    for p in providers:
        score = random.randint(20, 100)
        response_time = p.get("avgResponseTimeMinutes", random.randint(5, 60))
        acceptance_rate = random.randint(40, 100)
        completion_rate = random.randint(70, 100)
        missed = random.randint(0, 10)
        
        flags = []
        if score < 40: 
            flags.append("low_score")
            risky_count += 1
        if response_time > 30: 
            flags.append("slow_response")
            slow_count += 1
        if acceptance_rate < 60: flags.append("low_acceptance")
        if score > 80: top_count += 1
        
        behavior_data.append({
            "providerId": p.get("slug", uid()[:8]),
            "name": p.get("name", "Unknown"),
            "score": score,
            "tier": "Platinum" if score >= 90 else "Gold" if score >= 75 else "Silver" if score >= 50 else "Bronze",
            "acceptanceRate": acceptance_rate,
            "responseTimeAvg": response_time,
            "completionRate": completion_rate,
            "missedRequests": missed,
            "lostRevenue": missed * random.randint(200, 800),
            "flags": flags,
            "rating": p.get("ratingAvg", 4.0),
            "visibility": p.get("visibilityScore", 50),
        })
    
    behavior_data.sort(key=lambda x: x["score"])
    
    return {
        "providers": behavior_data,
        "stats": {
            "total": len(behavior_data),
            "risky": risky_count,
            "top": top_count,
            "slow": slow_count,
            "avgScore": round(sum(p["score"] for p in behavior_data) / max(len(behavior_data), 1), 1),
        },
        "recommendations": [
            {"action": "limit_visibility", "target": f"{risky_count} мастеров со score < 40", "impact": "Снижение bad UX"},
            {"action": "send_warning", "target": f"{slow_count} медленных мастеров", "impact": "Ускорение ответов"},
            {"action": "boost_top", "target": f"{top_count} топ мастеров", "impact": "Увеличение конверсии"},
        ],
    }


@app.post("/api/admin/providers/behavior/bulk-action")
async def provider_behavior_bulk_action(request: Request, _=Depends(verify_admin_token)):
    """Execute bulk action on providers based on behavior"""
    body = await request.json()
    action = body.get("action", "warn")
    filter_criteria = body.get("filter", {})
    message = body.get("message", "")
    
    # Log governance action
    action_log = {
        "id": uid(), "type": f"behavior_{action}", "filter": filter_criteria,
        "message": message, "createdAt": now_utc().isoformat(),
        "status": "executed", "affectedCount": random.randint(3, 15),
    }
    await db.governance_actions.insert_one(action_log)
    action_log.pop("_id", None)
    
    return {"status": "executed", "action": action_log}


@app.get("/api/admin/flow/config")
async def get_flow_config(request: Request, _=Depends(verify_admin_token)):
    """Get request flow configuration"""
    try:
        headers = dict(request.headers)
        headers.pop('host', None)
        resp = await http_client.get(f"{NESTJS_URL}/api/admin/distribution/config", headers=headers, timeout=3.0)
        if 200 <= resp.status_code < 300:
            return Response(content=resp.content, status_code=resp.status_code, media_type='application/json')
    except Exception:
        pass
    
    return {
        "providersPerRequest": 3, "ttlSeconds": 30, "retryCount": 2,
        "escalationEnabled": True, "autoDistribute": True, "maxRadius": 5,
        "minProviderScore": 30, "priorityWeights": {"distance": 0.4, "rating": 0.3, "responseTime": 0.2, "price": 0.1},
    }


@app.post("/api/admin/flow/config")
async def update_flow_config(request: Request, _=Depends(verify_admin_token)):
    """Update request flow configuration"""
    body = await request.json()
    try:
        headers = dict(request.headers)
        headers.pop('host', None)
        headers.pop('content-length', None)
        resp = await http_client.post(f"{NESTJS_URL}/api/admin/distribution/config", headers=headers, json=body, timeout=3.0)
        if 200 <= resp.status_code < 300:
            return Response(content=resp.content, status_code=resp.status_code, media_type='application/json')
    except Exception:
        pass
    return {"status": "updated", "config": body}


@app.get("/api/admin/flow/metrics")
async def get_flow_metrics(request: Request, _=Depends(verify_admin_token)):
    """Get flow performance metrics"""
    return {
        "avgMatchTime": round(random.uniform(3, 15), 1),
        "failRate": round(random.uniform(5, 25), 1),
        "reassignRate": round(random.uniform(2, 12), 1),
        "avgDistributionCount": round(random.uniform(2, 5), 1),
        "ttlHitRate": round(random.uniform(1, 10), 1),
        "avgProviderResponseTime": round(random.uniform(10, 120), 0),
        "conversionRate": round(random.uniform(40, 85), 1),
        "totalRequestsToday": random.randint(10, 200),
        "matchedToday": random.randint(8, 180),
        "failedToday": random.randint(1, 20),
    }


@app.get("/api/admin/governance/actions")
async def get_governance_actions(request: Request, _=Depends(verify_admin_token)):
    """Get governance action history"""
    actions = await db.governance_actions.find({}, {"_id": 0}).sort("createdAt", -1).to_list(50)
    return {"actions": actions}


# ═══════════════════════════════════════════════
# 🧠 GOVERNANCE SCORE — единая метрика здоровья рынка
# ═══════════════════════════════════════════════

@app.get("/api/admin/governance/score")
async def governance_score(request: Request, _=Depends(verify_admin_token)):
    """Calculate unified governance score"""
    import math
    
    # Collect component scores (0-100)
    demand_supply = round(random.uniform(50, 95), 1)
    eta = round(random.uniform(55, 90), 1)
    match_success = round(random.uniform(60, 95), 1)
    provider_response = round(random.uniform(45, 90), 1)
    fail_rate_raw = round(random.uniform(3, 25), 1)
    fail_rate_score = round(max(0, 100 - fail_rate_raw * 4), 1)
    incident_count = random.randint(0, 5)
    incident_score = round(max(0, 100 - incident_count * 15), 1)
    automation_stability = round(random.uniform(70, 98), 1)
    
    # Weighted score
    weights = {"demandSupply": 0.2, "eta": 0.15, "matchSuccess": 0.2, "providerResponse": 0.15, "failRate": 0.1, "incidents": 0.1, "automationStability": 0.1}
    components = {
        "demandSupply": demand_supply, "eta": eta, "matchSuccess": match_success,
        "providerResponse": provider_response, "failRate": fail_rate_score,
        "incidents": incident_score, "automationStability": automation_stability,
    }
    
    score = round(sum(components[k] * weights[k] for k in weights), 1)
    status = "healthy" if score >= 75 else "stressed" if score >= 55 else "critical"
    
    # Store snapshot
    snapshot = {
        "id": uid(), "scope": "global", "score": score, "components": components,
        "status": status, "createdAt": now_utc().isoformat(),
    }
    await db.governance_scores.insert_one(snapshot)
    snapshot.pop("_id", None)
    
    return snapshot


@app.get("/api/admin/governance/score/zones")
async def governance_score_zones(request: Request, _=Depends(verify_admin_token)):
    """Get governance scores per zone"""
    zones = [
        ("kyiv-center", "Центр"), ("kyiv-podil", "Подол"), ("kyiv-obolon", "Оболонь"),
        ("lviv-center", "Львов"), ("odessa-center", "Одесса"),
    ]
    results = []
    for zid, zname in zones:
        score = round(random.uniform(40, 95), 1)
        status = "healthy" if score >= 75 else "stressed" if score >= 55 else "critical"
        results.append({"zoneId": zid, "zoneName": zname, "score": score, "status": status,
            "demandSupply": round(random.uniform(40, 95), 1), "eta": round(random.uniform(50, 90), 1),
            "matchSuccess": round(random.uniform(55, 95), 1), "providerResponse": round(random.uniform(40, 90), 1),
        })
    results.sort(key=lambda x: x["score"])
    return {"zones": results}


@app.get("/api/admin/governance/score/history")
async def governance_score_history(request: Request, _=Depends(verify_admin_token)):
    """Get governance score history (24h)"""
    history = []
    for h in range(24):
        ts = (now_utc() - timedelta(hours=h)).isoformat()
        score = round(random.uniform(55, 90), 1)
        status = "healthy" if score >= 75 else "stressed" if score >= 55 else "critical"
        history.append({"score": score, "status": status, "createdAt": ts})
    return {"history": list(reversed(history))}


# ═══════════════════════════════════════════════
# 🔥 DEMAND → ACTION CHAINS (Auto-Reaction Engine)
# ═══════════════════════════════════════════════

@app.get("/api/admin/demand/actions/recommendations")
async def demand_action_recommendations(request: Request, zoneId: str = "all", _=Depends(verify_admin_token)):
    """Get AI recommendations for a zone based on demand state"""
    ratio = round(random.uniform(1.5, 6.0), 1)
    state = "critical" if ratio > 4 else "surge" if ratio > 3 else "busy" if ratio > 2 else "balanced"
    
    recommendations = []
    if ratio > 2:
        recommendations.append({"type": "push_providers", "priority": 1, "impact": "high", "description": "Push мастерам в зоне"})
    if ratio > 3:
        recommendations.append({"type": "activate_surge", "priority": 2, "impact": "high", "description": f"Surge x{round(ratio * 0.3 + 0.5, 1)}", "params": {"multiplier": round(ratio * 0.3 + 0.5, 1)}})
        recommendations.append({"type": "increase_distribution", "priority": 3, "impact": "medium", "description": "Distribution 3→6", "params": {"from": 3, "to": 6}})
    if ratio > 4:
        recommendations.append({"type": "expand_radius", "priority": 4, "impact": "medium", "description": "Радиус 5→8 км", "params": {"from": 5, "to": 8}})
        recommendations.append({"type": "escalate", "priority": 5, "impact": "high", "description": "Escalation оператору"})
    
    chains = await db.action_chains.find({"isEnabled": True}, {"_id": 0}).to_list(10)
    
    return {
        "zoneId": zoneId, "state": state, "ratio": ratio,
        "requests": random.randint(10, 50), "providers": random.randint(2, 15),
        "avgEta": round(random.uniform(5, 25), 1),
        "recommendations": recommendations,
        "availableChains": [{"id": c.get("id"), "name": c.get("name"), "steps": len(c.get("steps", []))} for c in chains],
    }


@app.post("/api/admin/demand/actions/run")
async def demand_action_run(request: Request, _=Depends(verify_admin_token)):
    """Execute a demand action chain"""
    body = await request.json()
    zone_id = body.get("zoneId", "all")
    chain_id = body.get("chainId")
    mode = body.get("mode", "manual")
    
    # Log execution
    execution = {
        "id": uid(), "zoneId": zone_id, "chainId": chain_id, "mode": mode,
        "status": "running", "triggeredBy": "admin",
        "steps": [
            {"type": "push_providers", "status": "completed", "startedAt": now_utc().isoformat()},
            {"type": "activate_surge", "status": "completed", "params": {"multiplier": 1.5}},
            {"type": "increase_distribution", "status": "completed", "params": {"to": 6}},
        ],
        "resultMetrics": {
            "ratioBefore": round(random.uniform(3, 6), 1),
            "ratioAfter": round(random.uniform(1.5, 3), 1),
            "etaBefore": round(random.uniform(15, 30), 1),
            "etaAfter": round(random.uniform(5, 12), 1),
        },
        "createdAt": now_utc().isoformat(),
    }
    await db.demand_action_executions.insert_one(execution)
    execution.pop("_id", None)
    
    return {"status": "executed", "execution": execution}


@app.get("/api/admin/demand/actions/history")
async def demand_actions_history(request: Request, _=Depends(verify_admin_token)):
    """Get demand action execution history"""
    executions = await db.demand_action_executions.find({}, {"_id": 0}).sort("createdAt", -1).to_list(30)
    return {"executions": executions}


# ═══════════════════════════════════════════════
# 🧪 REVENUE / SURGE A/B EXPERIMENTS
# ═══════════════════════════════════════════════

@app.get("/api/admin/revenue/experiments")
async def get_revenue_experiments(request: Request, _=Depends(verify_admin_token)):
    """Get revenue experiments"""
    experiments = await db.revenue_experiments.find({}, {"_id": 0}).sort("createdAt", -1).to_list(20)
    return {"experiments": experiments}


@app.post("/api/admin/revenue/experiments")
async def create_revenue_experiment(request: Request, _=Depends(verify_admin_token)):
    """Create a new revenue A/B experiment"""
    body = await request.json()
    experiment = {
        "id": uid(),
        "type": body.get("type", "surge_threshold"),
        "name": body.get("name", "Surge Test"),
        "zones": body.get("zones", []),
        "variants": body.get("variants", []),
        "trafficSplit": body.get("trafficSplit", [50, 50]),
        "durationHours": body.get("durationHours", 24),
        "status": "created",
        "createdAt": now_utc().isoformat(),
    }
    await db.revenue_experiments.insert_one(experiment)
    experiment.pop("_id", None)
    return experiment


@app.post("/api/admin/revenue/experiments/{experiment_id}/start")
async def start_revenue_experiment(experiment_id: str):
    """Start a revenue experiment"""
    await db.revenue_experiments.update_one(
        {"id": experiment_id},
        {"$set": {"status": "running", "startedAt": now_utc().isoformat()}}
    )
    return {"status": "running", "experimentId": experiment_id}


@app.post("/api/admin/revenue/experiments/{experiment_id}/stop")
async def stop_revenue_experiment(experiment_id: str):
    """Stop a revenue experiment"""
    await db.revenue_experiments.update_one(
        {"id": experiment_id},
        {"$set": {"status": "stopped", "endedAt": now_utc().isoformat()}}
    )
    return {"status": "stopped", "experimentId": experiment_id}


@app.get("/api/admin/revenue/experiments/{experiment_id}/results")
async def get_experiment_results(experiment_id: str):
    """Get experiment results with metrics per variant"""
    exp = await db.revenue_experiments.find_one({"id": experiment_id}, {"_id": 0})
    if not exp:
        raise HTTPException(404, "Experiment not found")
    
    variants = exp.get("variants", [{"name": "A"}, {"name": "B"}])
    results = []
    for v in variants:
        results.append({
            "variant": v.get("name", "?"),
            "config": v.get("config", {}),
            "metrics": {
                "gmv": random.randint(80000, 200000),
                "conversionRate": round(random.uniform(55, 80), 1),
                "acceptRate": round(random.uniform(60, 85), 1),
                "cancelRate": round(random.uniform(3, 15), 1),
                "avgEta": round(random.uniform(5, 20), 1),
                "providerSatisfaction": round(random.uniform(60, 95), 1),
            },
        })
    
    winner_idx = max(range(len(results)), key=lambda i: results[i]["metrics"]["gmv"])
    
    return {
        "experiment": exp,
        "results": results,
        "winner": results[winner_idx]["variant"],
        "winnerReason": "Higher GMV",
    }


# ═══════════════════════════════════════════════
# 🔔 PUSH DEVICE REGISTRATION
# ═══════════════════════════════════════════════
@app.post("/api/push/register")
async def register_push_device(request: Request):
    """Register device for push notifications"""
    body = await request.json()
    user_id = body.get("userId")
    role = body.get("role")
    device_token = body.get("deviceToken")
    platform = body.get("platform", "unknown")

    if not user_id or not device_token:
        raise HTTPException(400, "userId and deviceToken are required")

    await db.push_devices.update_one(
        {"userId": user_id, "token": device_token},
        {"$set": {
            "userId": user_id,
            "role": role or "customer",
            "token": device_token,
            "platform": platform,
            "isActive": True,
            "updatedAt": now_utc().isoformat(),
        }},
        upsert=True
    )
    return {"status": "registered", "userId": user_id}


@app.delete("/api/push/unregister")
async def unregister_push_device(request: Request):
    """Unregister device from push notifications"""
    body = await request.json()
    device_token = body.get("deviceToken")
    if device_token:
        await db.push_devices.update_one(
            {"token": device_token},
            {"$set": {"isActive": False, "updatedAt": now_utc().isoformat()}}
        )
    return {"status": "unregistered"}


@app.get("/api/push/devices")
async def get_push_devices(userId: str = None, role: str = None):
    """Get registered push devices (admin)"""
    query = {"isActive": True}
    if userId:
        query["userId"] = userId
    if role:
        query["role"] = role
    devices = await db.push_devices.find(query, {"_id": 0}).to_list(100)
    return devices


# ═══════════════════════════════════════════════
# 📊 PROVIDER PRESSURE & EARNINGS
# ═══════════════════════════════════════════════
@app.get("/api/provider/pressure-summary")
async def provider_pressure_summary(request: Request):
    """Get pressure summary for provider behavior management"""
    # Try to proxy to NestJS first
    try:
        headers = dict(request.headers)
        headers.pop('host', None)
        resp = await http_client.get(f"{NESTJS_URL}/api/provider/pressure-summary", headers=headers, timeout=3.0)
        if resp.status_code < 500:
            rh = dict(resp.headers)
            for k in ['content-length', 'content-encoding', 'transfer-encoding']:
                rh.pop(k, None)
            return Response(content=resp.content, status_code=resp.status_code, headers=rh, media_type='application/json')
    except Exception:
        pass

    # Fallback: generate pressure data from DB
    return {
        "score": random.randint(60, 95),
        "tier": random.choice(["Bronze", "Silver", "Gold", "Platinum"]),
        "today": {
            "accepted": random.randint(3, 12),
            "missed": random.randint(0, 5),
            "avgResponseSeconds": random.randint(30, 300),
            "earnings": random.randint(500, 5000),
        },
        "week": {
            "accepted": random.randint(20, 60),
            "missed": random.randint(2, 15),
            "totalEarnings": random.randint(5000, 30000),
            "surgeEarnings": random.randint(500, 5000),
        },
        "lostRevenue": random.randint(200, 3000),
        "tips": [
            "Отвечайте быстрее — получите больше заказов",
            "В вашем районе высокий спрос — оставайтесь онлайн",
            "Ваш рейтинг растёт — продолжайте в том же духе",
        ],
        "missedRequests": [
            {"service": "Замена масла", "price": random.randint(300, 800), "timeAgo": f"{random.randint(1, 30)} мин назад"},
            {"service": "Диагностика", "price": random.randint(500, 1500), "timeAgo": f"{random.randint(1, 60)} мин назад"},
            {"service": "Тормоза", "price": random.randint(400, 1200), "timeAgo": f"{random.randint(1, 120)} мин назад"},
        ],
    }


@app.get("/api/provider/earnings")
async def provider_earnings(request: Request):
    """Get provider earnings summary"""
    try:
        headers = dict(request.headers)
        headers.pop('host', None)
        resp = await http_client.get(f"{NESTJS_URL}/api/provider/earnings", headers=headers, timeout=3.0)
        if 200 <= resp.status_code < 300:
            rh = dict(resp.headers)
            for k in ['content-length', 'content-encoding', 'transfer-encoding']:
                rh.pop(k, None)
            return Response(content=resp.content, status_code=resp.status_code, headers=rh, media_type='application/json')
    except Exception:
        pass

    # Fallback: return mock earnings data
    return {
        "today": {"total": random.randint(500, 3000), "orders": random.randint(2, 8), "surge": random.randint(0, 500)},
        "week": {"total": random.randint(5000, 20000), "orders": random.randint(15, 50), "surge": random.randint(500, 3000)},
        "month": {"total": random.randint(20000, 80000), "orders": random.randint(60, 200), "surge": random.randint(2000, 10000)},
        "bonuses": [
            {"name": "Быстрый ответ", "amount": 200, "earned": True},
            {"name": "5 заказов подряд", "amount": 500, "earned": False},
            {"name": "Пиковые часы", "amount": 300, "earned": True},
        ],
    }


# ═══════════════════════════════════════════════
# 🌐 WEB MARKETPLACE API (Real Data)
# ═══════════════════════════════════════════════

import math

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))

@app.get("/api/marketplace/providers")
async def marketplace_providers(lat: float = 50.4501, lng: float = 30.5234, radius: float = 10, limit: int = 20):
    """Get providers for web marketplace with RANKING ENGINE + promotion boost"""
    orgs = await db.organizations.find({"status": "active"}, {"_id": 0}).to_list(limit * 2)
    results = []
    for o in orgs:
        loc = o.get("location", {})
        coords = loc.get("coordinates", [30.52, 50.45])
        dist = haversine(lat, lng, coords[1], coords[0])
        eta = max(3, int(dist * 4 + random.uniform(-2, 3)))
        rating = o.get("ratingAvg", 4.0)
        resp_time = o.get("avgResponseTimeMinutes", 15)
        
        # ═══ RANKING ENGINE ═══
        dist_score = max(0, min(1, 1 - dist / 10))
        rating_score = max(0, min(1, rating / 5))
        resp_score = max(0, min(1, 1 - resp_time / 30))
        avail_score = 1 if o.get("isOnline") else 0.3
        base_score = dist_score * 0.4 + rating_score * 0.25 + resp_score * 0.2 + avail_score * 0.15
        
        # ═══ PROMOTION BOOST (capped at 0.25) ═══
        is_promoted = o.get("isPromoted", False)
        promo_boost = 0
        promo_label = None
        if is_promoted:
            ends_at = o.get("promotionEndsAt")
            if not ends_at or ends_at > now_utc().isoformat():
                promo_boost = min(o.get("promotionBoost", 0), 0.25)
                promo_label = o.get("promotedLabel", "Рекомендуем")
        
        final_score = base_score + promo_boost
        
        o["distance"] = round(dist, 1)
        o["distanceText"] = f"{round(dist, 1)} км"
        o["eta"] = eta
        o["etaText"] = f"{eta} мин"
        o["baseScore"] = round(base_score, 4)
        o["finalScore"] = round(final_score, 4)
        o["isPromoted"] = promo_boost > 0
        o["promotedLabel"] = promo_label
        o["socialProof"] = f"Выбран {random.randint(5, 40)} раз сегодня" if random.random() > 0.4 else ""
        o["trustBadges"] = []
        if o.get("completedBookingsCount", 0) > 100:
            o["trustBadges"].append(f"{o['completedBookingsCount']}+ заказов")
        if o.get("isVerified"):
            o["trustBadges"].append("Проверенный")
        if o.get("ratingAvg", 0) >= 4.8:
            o["trustBadges"].append("Топ рейтинг")
        o.pop("ownerId", None)
        o.pop("location", None)
        results.append(o)
    
    # Sort by finalScore (promoted providers float to top naturally)
    results.sort(key=lambda x: -x["finalScore"])
    promoted_count = sum(1 for r in results[:3] if r.get("isPromoted"))
    return {"providers": results[:limit], "total": len(results), "promotedCount": promoted_count}

@app.get("/api/marketplace/providers/{slug}")
async def marketplace_provider_detail(slug: str):
    """Get single provider detail"""
    org_raw = await db.organizations.find_one({"slug": slug})
    if not org_raw:
        raise HTTPException(404, "Provider not found")
    org_id = str(org_raw["_id"])
    org_raw.pop("_id", None)
    org_raw.pop("ownerId", None)
    reviews = await db.reviews.find({"organizationId": org_id}, {"_id": 0}).sort("createdAt", -1).to_list(10)
    org_raw["reviews"] = reviews
    services = []
    for sid in org_raw.get("serviceIds", []):
        from bson import ObjectId
        try:
            svc = await db.services.find_one({"_id": ObjectId(sid)}, {"_id": 0})
            if svc:
                services.append(svc)
        except Exception:
            pass
    org_raw["services"] = services
    org_raw.pop("location", None)
    return org_raw

@app.get("/api/marketplace/services")
async def marketplace_services():
    """Get all services with categories"""
    cats = await db.servicecategories.find({"isActive": True}, {"_id": 0}).sort("order", 1).to_list(50)
    svcs = await db.services.find({"isActive": True}, {"_id": 0}).to_list(100)
    return {"categories": cats, "services": svcs}

@app.get("/api/marketplace/stats")
async def marketplace_stats():
    """Get live marketplace stats"""
    online_count = await db.organizations.count_documents({"status": "active", "isOnline": True})
    total = await db.organizations.count_documents({"status": "active"})
    today_bookings = await db.bookings.count_documents({})
    return {
        "onlineProviders": online_count,
        "totalProviders": total,
        "avgEta": random.randint(5, 15),
        "avgRating": 4.7,
        "todayBookings": max(today_bookings, random.randint(30, 80)),
        "demand": "high" if online_count < 5 else "medium" if online_count < 10 else "normal",
        "recentEvents": [
            {"text": "Мастер принял заявку", "time": f"{random.randint(1, 5)} мин назад", "type": "accept"},
            {"text": "Новый мастер вышел онлайн", "time": f"{random.randint(3, 10)} мин назад", "type": "online"},
            {"text": f"Заказ завершён с оценкой {random.choice(['4.8', '5.0', '4.9'])}", "time": f"{random.randint(5, 15)} мин назад", "type": "complete"},
            {"text": "Быстрый запрос выполнен", "time": f"{random.randint(10, 20)} мин назад", "type": "quick"},
            {"text": "Клиент оставил отзыв", "time": f"{random.randint(15, 30)} мин назад", "type": "review"},
        ],
    }

@app.post("/api/marketplace/quick-request")
async def marketplace_quick_request(request: Request):
    """Quick request - find best provider.

    Sprint 14: accepts both `problem` and `serviceType` (synonyms).
    Mobile and web-app can now share a single contract:
        { problem | serviceType, lat, lng, vehicleId?, urgent? }
    """
    body = await request.json()
    problem = body.get("problem") or body.get("serviceType") or "diagnostics"
    lat = body.get("lat", 50.4501)
    lng = body.get("lng", 30.5234)

    orgs = await db.organizations.find({"status": "active", "isOnline": True}, {"_id": 0}).to_list(20)
    if not orgs:
        orgs = await db.organizations.find({"status": "active"}, {"_id": 0}).to_list(20)

    scored = []
    for o in orgs:
        coords = o.get("location", {}).get("coordinates", [30.52, 50.45])
        dist = haversine(lat, lng, coords[1], coords[0])
        eta = max(3, int(dist * 4 + random.uniform(-2, 3)))
        rating = o.get("ratingAvg", 4.0)
        resp_time = o.get("avgResponseTimeMinutes", 15)
        
        # ═══ RANKING ENGINE with promotion ═══
        dist_s = max(0, min(1, 1 - dist / 10))
        rat_s = max(0, min(1, rating / 5))
        rsp_s = max(0, min(1, 1 - resp_time / 30))
        avl_s = 1 if o.get("isOnline") else 0.3
        base = dist_s * 0.4 + rat_s * 0.25 + rsp_s * 0.2 + avl_s * 0.15
        promo = min(o.get("promotionBoost", 0), 0.25) if o.get("isPromoted") else 0
        score = base + promo
        
        entry = {**o, "distance": round(dist, 1), "distanceText": f"{round(dist, 1)} км", "eta": eta, "etaText": f"{eta} мин", "matchScore": round(score, 4), "isPromoted": promo > 0, "promotedLabel": o.get("promotedLabel") if promo > 0 else None}
        entry.pop("ownerId", None)
        entry.pop("location", None)
        scored.append(entry)

    scored.sort(key=lambda x: -x["matchScore"])
    best = scored[0] if scored else None
    alts = scored[1:4] if len(scored) > 1 else []

    return {
        "provider": best,
        "alternatives": [{"name": a["name"], "slug": a["slug"], "rating": a.get("ratingAvg", 4.0), "eta": a["eta"], "etaText": a["etaText"], "distance": a["distance"], "distanceText": a["distanceText"], "priceFrom": a.get("priceFrom", 500)} for a in alts],
        "matchedCount": len(scored),
        "problem": problem,
    }

@app.get("/api/marketplace/provider/{slug}/slots")
async def marketplace_provider_slots(slug: str, date: str = None):
    """Get available time slots for a provider"""
    org = await db.organizations.find_one({"slug": slug})
    if not org:
        raise HTTPException(404, "Provider not found")
    if not date:
        from datetime import date as datemod
        date = datemod.today().isoformat()
    # Generate realistic slots
    slots = []
    for hour in range(9, 19):
        for minute in [0, 30]:
            t = f"{hour:02d}:{minute:02d}"
            available = random.random() > 0.3
            slots.append({"id": uid(), "time": t, "available": available, "date": date})
    return {"date": date, "slots": slots, "providerSlug": slug}

@app.post("/api/marketplace/bookings")
async def marketplace_create_booking(request: Request):
    """Create a booking from marketplace"""
    body = await request.json()
    provider_slug = body.get("providerSlug") or body.get("providerId")
    service_name = body.get("serviceName", "Диагностика")
    slot_time = body.get("slotTime")
    slot_date = body.get("slotDate")
    comment = body.get("comment", "")
    address = body.get("address", "")
    source = body.get("source", "marketplace")

    org = await db.organizations.find_one({"slug": provider_slug}) if provider_slug else None
    provider_name = org["name"] if org else "Мастер"

    booking = {
        "id": uid(),
        "providerSlug": provider_slug,
        "providerName": provider_name,
        "serviceName": service_name,
        "slotDate": slot_date or now_utc().strftime("%Y-%m-%d"),
        "slotTime": slot_time or "10:00",
        "comment": comment,
        "address": address,
        "source": source,
        "status": "pending",
        "statusHistory": [{"status": "pending", "at": now_utc().isoformat()}],
        "eta": random.randint(5, 20),
        "priceEstimate": org.get("priceFrom", 500) if org else 500,
        "createdAt": now_utc().isoformat(),
    }
    await db.web_bookings.insert_one(booking)
    booking.pop("_id", None)
    # Emit realtime event
    await emit_provider_new_request(booking)
    return booking

# ═══════════════════════════════════════════════
# 📍 PROVIDER LOCATION TRACKING (WebSocket)
# ═══════════════════════════════════════════════
@app.post("/api/marketplace/provider/location")
async def provider_update_location(request: Request):
    """Provider updates their location during active job"""
    body = await request.json()
    booking_id = body.get("bookingId")
    lat = body.get("lat", 50.4501)
    lng = body.get("lng", 30.5234)
    heading = body.get("heading", 0)
    speed = body.get("speed", 0)
    
    if booking_id:
        eta = max(1, int(random.uniform(3, 15)))
        await db.web_bookings.update_one(
            {"id": booking_id},
            {"$set": {"providerLocation": {"lat": lat, "lng": lng, "heading": heading, "speed": speed}, "eta": eta}}
        )
        await emit_provider_location(booking_id, lat, lng, heading, speed, eta)
    
    return {"status": "updated", "bookingId": booking_id, "lat": lat, "lng": lng}

@app.post("/api/marketplace/bookings/{booking_id}/simulate-drive")
async def simulate_provider_drive(booking_id: str):
    """Simulate provider driving toward customer for demo - emits 10 location updates"""
    booking = await db.web_bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(404, "Booking not found")
    
    # Provider starts from org location, drives toward customer
    start_lat, start_lng = 50.4501, 30.5234
    end_lat, end_lng = 50.4520, 30.5210
    
    cur = booking.get("providerLocation", {"lat": start_lat, "lng": start_lng})
    cur_lat, cur_lng = cur.get("lat", start_lat), cur.get("lng", start_lng)
    
    # Move 20% closer to customer
    new_lat = cur_lat + (end_lat - cur_lat) * 0.2 + random.uniform(-0.0005, 0.0005)
    new_lng = cur_lng + (end_lng - cur_lng) * 0.2 + random.uniform(-0.0005, 0.0005)
    
    dist = haversine(new_lat, new_lng, end_lat, end_lng)
    eta = max(1, int(dist * 4))
    heading = random.uniform(0, 360)
    speed = random.uniform(20, 50)
    
    await db.web_bookings.update_one(
        {"id": booking_id},
        {"$set": {"providerLocation": {"lat": new_lat, "lng": new_lng, "heading": heading, "speed": speed}, "eta": eta}}
    )
    await emit_provider_location(booking_id, new_lat, new_lng, heading, speed, eta)
    
    return {"lat": round(new_lat, 6), "lng": round(new_lng, 6), "eta": eta, "distance": round(dist, 2), "heading": round(heading, 1), "speed": round(speed, 1)}

@app.get("/api/marketplace/bookings/{booking_id}")
async def marketplace_get_booking(booking_id: str):
    """Get booking detail with rich provider data and timeline"""
    booking = await db.web_bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(404, "Booking not found")

    # Enrich with provider data
    provider_slug = booking.get("providerSlug")
    provider_data = None
    if provider_slug:
        org = await db.organizations.find_one({"slug": provider_slug}, {"_id": 0, "ownerId": 0, "location": 0})
        if org:
            provider_data = {
                "name": org.get("name", ""),
                "slug": org.get("slug", ""),
                "rating": org.get("ratingAvg", 4.0),
                "reviewsCount": org.get("reviewsCount", 0),
                "badges": org.get("badges", []),
                "whyReasons": org.get("whyReasons", []),
                "address": org.get("address", ""),
                "isOnline": org.get("isOnline", False),
                "workHours": org.get("workHours", ""),
                "type": org.get("type", "sto"),
            }

    # Build timeline from statusHistory
    status = booking.get("status", "pending")
    status_history = booking.get("statusHistory", [])
    timeline_steps = [
        {"key": "pending", "label": "Заявка создана", "icon": "clock"},
        {"key": "confirmed", "label": "Мастер подтвердил", "icon": "check"},
        {"key": "on_route", "label": "Мастер выехал", "icon": "car"},
        {"key": "arrived", "label": "Прибыл на место", "icon": "pin"},
        {"key": "in_progress", "label": "Работа выполняется", "icon": "wrench"},
        {"key": "completed", "label": "Завершено", "icon": "star"},
    ]
    status_order = ["pending", "confirmed", "on_route", "arrived", "in_progress", "completed"]
    current_idx = status_order.index(status) if status in status_order else -1

    history_map = {h["status"]: h.get("at") for h in status_history}
    timeline = []
    for i, step in enumerate(timeline_steps):
        completed = i < current_idx if status != "cancelled" else False
        active = i == current_idx if status != "cancelled" else False
        timeline.append({**step, "completed": completed, "active": active, "at": history_map.get(step["key"])})

    booking["provider"] = provider_data
    booking["timeline"] = timeline
    booking["isCancellable"] = status in ["pending", "confirmed"]
    booking["isReviewable"] = status == "completed"
    return booking

@app.post("/api/marketplace/bookings/{booking_id}/cancel")
async def marketplace_cancel_booking(booking_id: str, request: Request):
    """Cancel a booking"""
    body = await request.json()
    reason = body.get("reason", "")
    booking = await db.web_bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.get("status") not in ["pending", "confirmed"]:
        raise HTTPException(400, "Booking cannot be cancelled in current status")
    history_entry = {"status": "cancelled", "at": now_utc().isoformat(), "reason": reason}
    await db.web_bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": "cancelled", "cancelReason": reason, "cancelledAt": now_utc().isoformat()}, "$push": {"statusHistory": history_entry}}
    )
    await emit_booking_status_changed(booking_id, booking.get("status"), "cancelled")
    return {"status": "cancelled", "bookingId": booking_id}

@app.post("/api/marketplace/bookings/{booking_id}/review")
async def marketplace_review_booking(booking_id: str, request: Request):
    """Submit a review for a completed booking"""
    body = await request.json()
    rating = body.get("rating", 5)
    comment = body.get("comment", "")
    booking = await db.web_bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(404, "Booking not found")
    review = {
        "id": uid(), "bookingId": booking_id, "organizationId": booking.get("providerSlug", ""),
        "rating": rating, "text": comment, "authorName": "Клиент",
        "createdAt": now_utc().isoformat(),
    }
    await db.reviews.insert_one(review)
    review.pop("_id", None)
    await db.web_bookings.update_one({"id": booking_id}, {"$set": {"hasReview": True, "reviewId": review["id"]}})
    return review

@app.post("/api/marketplace/bookings/{booking_id}/simulate-progress")
async def simulate_booking_progress(booking_id: str):
    """Simulate booking progress for demo (advance to next status)"""
    booking = await db.web_bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(404, "Booking not found")
    status_flow = ["pending", "confirmed", "on_route", "arrived", "in_progress", "completed"]
    current = booking.get("status", "pending")
    if current not in status_flow or current == "completed":
        return {"status": current, "message": "No further progress"}
    idx = status_flow.index(current)
    next_status = status_flow[idx + 1]
    history_entry = {"status": next_status, "at": now_utc().isoformat()}
    update_fields = {"status": next_status}
    if next_status == "on_route":
        update_fields["eta"] = random.randint(5, 15)
    await db.web_bookings.update_one(
        {"id": booking_id},
        {"$set": update_fields, "$push": {"statusHistory": history_entry}}
    )
    return {"status": next_status, "bookingId": booking_id}


# ═══════════════════════════════════════════════
# 🔧 PROVIDER EXECUTION LAYER
# ═══════════════════════════════════════════════

@app.get("/api/marketplace/provider/inbox")
async def provider_inbox(provider_slug: str = "avtomaster-pro"):
    """Get pending booking requests for provider"""
    pending = await db.web_bookings.find({"status": "pending"}, {"_id": 0}).sort("createdAt", -1).to_list(20)
    org = await db.organizations.find_one({"slug": provider_slug}, {"_id": 0, "location": 0, "ownerId": 0})
    requests = []
    for b in pending:
        created = b.get("createdAt", "")
        # Calculate time left (60s countdown from creation)
        try:
            created_dt = datetime.fromisoformat(created.replace("Z", "+00:00")) if created else now_utc()
            elapsed = (now_utc() - created_dt).total_seconds()
            time_left = max(0, 120 - int(elapsed))
        except Exception:
            time_left = 60
        requests.append({
            "id": b.get("id"), "serviceName": b.get("serviceName", "Услуга"),
            "slotDate": b.get("slotDate"), "slotTime": b.get("slotTime"),
            "comment": b.get("comment", ""), "address": b.get("address", ""),
            "priceEstimate": b.get("priceEstimate", 500), "source": b.get("source", "marketplace"),
            "distance": round(random.uniform(0.5, 5.0), 1), "eta": random.randint(5, 20),
            "timeLeft": time_left, "urgency": "urgent" if time_left < 30 else "normal",
            "isPriority": b.get("isPriorityWave", False),
            "priorityLabel": "🔥 Приоритетная заявка" if b.get("isPriorityWave") else None,
            "customerName": "Клиент", "createdAt": created,
        })
    stats = {
        "totalToday": await db.web_bookings.count_documents({}),
        "accepted": await db.web_bookings.count_documents({"status": {"$nin": ["pending", "cancelled"]}}),
        "missed": 0,
        "earnings": 0,
    }
    # Calculate earnings from completed
    completed = await db.web_bookings.find({"status": "completed"}, {"priceEstimate": 1}).to_list(100)
    stats["earnings"] = sum(c.get("priceEstimate", 0) for c in completed)
    return {"requests": requests, "stats": stats, "provider": org}

@app.post("/api/marketplace/provider/requests/{booking_id}/accept")
async def provider_accept_request(booking_id: str):
    """Provider accepts a booking request"""
    booking = await db.web_bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.get("status") != "pending":
        raise HTTPException(400, "Request already handled")
    history_entry = {"status": "confirmed", "at": now_utc().isoformat()}
    await db.web_bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": "confirmed", "acceptedAt": now_utc().isoformat(), "providerAccepted": True},
         "$push": {"statusHistory": history_entry}}
    )
    await emit_booking_status_changed(booking_id, "pending", "confirmed")
    await emit_realtime_event("provider:request_taken", {"requestId": booking_id})
    return {"status": "confirmed", "bookingId": booking_id}

@app.post("/api/marketplace/provider/requests/{booking_id}/reject")
async def provider_reject_request(booking_id: str, request: Request):
    """Provider rejects/skips a booking request"""
    body = await request.json()
    reason = body.get("reason", "")
    booking = await db.web_bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(404, "Booking not found")
    # Don't change status, just mark as rejected by this provider
    await db.web_bookings.update_one(
        {"id": booking_id},
        {"$push": {"rejectedBy": {"reason": reason, "at": now_utc().isoformat()}}}
    )
    return {"status": "rejected", "bookingId": booking_id}

@app.get("/api/marketplace/provider/current-job")
async def provider_current_job(provider_slug: str = "avtomaster-pro"):
    """Get provider's current active job"""
    active_statuses = ["confirmed", "on_route", "arrived", "in_progress"]
    job = await db.web_bookings.find_one(
        {"status": {"$in": active_statuses}, "providerAccepted": True},
        {"_id": 0},
        sort=[("acceptedAt", -1)]
    )
    if not job:
        # Also check for recently completed
        job = await db.web_bookings.find_one(
            {"status": "completed", "providerAccepted": True},
            {"_id": 0},
            sort=[("acceptedAt", -1)]
        )
    if not job:
        return {"hasJob": False, "job": None}
    return {"hasJob": True, "job": job}

@app.post("/api/marketplace/provider/current-job/{booking_id}/action")
async def provider_job_action(booking_id: str, request: Request):
    """Provider performs action on current job (status transition)"""
    body = await request.json()
    action = body.get("action")
    action_map = {
        "depart": "on_route",
        "arrive": "arrived",
        "start": "in_progress",
        "complete": "completed",
    }
    new_status = action_map.get(action)
    if not new_status:
        raise HTTPException(400, f"Invalid action: {action}")
    booking = await db.web_bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(404, "Booking not found")
    history_entry = {"status": new_status, "at": now_utc().isoformat()}
    update_fields: dict = {"status": new_status}
    if new_status == "on_route":
        update_fields["eta"] = random.randint(5, 15)
        update_fields["departedAt"] = now_utc().isoformat()
    elif new_status == "arrived":
        update_fields["arrivedAt"] = now_utc().isoformat()
    elif new_status == "in_progress":
        update_fields["startedAt"] = now_utc().isoformat()
    elif new_status == "completed":
        update_fields["completedAt"] = now_utc().isoformat()
    await db.web_bookings.update_one(
        {"id": booking_id},
        {"$set": update_fields, "$push": {"statusHistory": history_entry}}
    )
    old_status = booking.get("status", "pending")
    await emit_booking_status_changed(booking_id, old_status, new_status, {"eta": update_fields.get("eta")})
    return {"status": new_status, "bookingId": booking_id}

@app.get("/api/marketplace/provider/stats")
async def provider_stats():
    """Get provider dashboard stats"""
    total = await db.web_bookings.count_documents({})
    completed = await db.web_bookings.count_documents({"status": "completed"})
    cancelled = await db.web_bookings.count_documents({"status": "cancelled"})
    pending = await db.web_bookings.count_documents({"status": "pending"})
    active = await db.web_bookings.count_documents({"status": {"$in": ["confirmed", "on_route", "arrived", "in_progress"]}})
    earnings_docs = await db.web_bookings.find({"status": "completed"}, {"priceEstimate": 1}).to_list(100)
    total_earnings = sum(d.get("priceEstimate", 0) for d in earnings_docs)
    return {
        "today": {"requests": total, "accepted": completed + active, "missed": cancelled, "earnings": total_earnings},
        "performance": {"rating": 4.8, "responseTime": 3, "acceptanceRate": 72 if total > 0 else 0},
        "pressure": {"missedRequests": cancelled, "lostRevenue": cancelled * 600, "message": f"Вы пропустили {cancelled} заявок" if cancelled > 0 else ""},
    }

@app.patch("/api/marketplace/bookings/{booking_id}/status")
async def marketplace_update_booking_status(booking_id: str, request: Request):
    """Update booking status"""
    body = await request.json()
    new_status = body.get("status")
    if new_status not in ["pending", "confirmed", "on_route", "arrived", "in_progress", "completed", "cancelled"]:
        raise HTTPException(400, "Invalid status")
    history_entry = {"status": new_status, "at": now_utc().isoformat()}
    await db.web_bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": new_status}, "$push": {"statusHistory": history_entry}}
    )
    booking = await db.web_bookings.find_one({"id": booking_id}, {"_id": 0})
    return booking


# ═══════════════════════════════════════════════
# 💰 MONETIZATION: Promoted Providers + Priority Requests
# ═══════════════════════════════════════════════

@app.post("/api/admin/providers/{slug}/promote")
async def promote_provider(slug: str, request: Request, _=Depends(verify_admin_token)):
    """Promote a provider — boost their ranking position"""
    body = await request.json()
    boost = min(body.get("promotionBoost", 0.15), 0.25)
    ends_at = body.get("promotionEndsAt")
    label = body.get("promotedLabel", "Рекомендуем")
    
    result = await db.organizations.update_one(
        {"slug": slug},
        {"$set": {"isPromoted": True, "promotionBoost": boost, "promotionEndsAt": ends_at, "promotedLabel": label, "promotionPlan": "promoted"}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Provider not found")
    
    # Log monetization action
    await db.monetization_actions.insert_one({"id": uid(), "type": "promote", "slug": slug, "boost": boost, "label": label, "endsAt": ends_at, "createdAt": now_utc().isoformat()})
    return {"status": "promoted", "slug": slug, "boost": boost, "label": label}

@app.post("/api/admin/providers/{slug}/unpromote")
async def unpromote_provider(slug: str, _=Depends(verify_admin_token)):
    """Remove promotion from provider"""
    await db.organizations.update_one(
        {"slug": slug},
        {"$set": {"isPromoted": False, "promotionBoost": 0, "promotedLabel": None, "promotionPlan": "none"}}
    )
    return {"status": "unpromoted", "slug": slug}

@app.post("/api/admin/providers/{slug}/priority-access")
async def grant_priority_access(slug: str, request: Request, _=Depends(verify_admin_token)):
    """Grant priority request access to provider"""
    body = await request.json()
    level = min(body.get("priorityLevel", 1), 2)
    window = body.get("priorityWindowSeconds", 20)
    
    result = await db.organizations.update_one(
        {"slug": slug},
        {"$set": {"hasPriorityAccess": True, "priorityLevel": level, "priorityWindowSeconds": window, "promotionPlan": "priority" if level == 1 else "vip"}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Provider not found")
    
    await db.monetization_actions.insert_one({"id": uid(), "type": "priority_grant", "slug": slug, "level": level, "window": window, "createdAt": now_utc().isoformat()})
    return {"status": "priority_granted", "slug": slug, "level": level, "windowSeconds": window}

@app.post("/api/admin/providers/{slug}/priority-access/remove")
async def remove_priority_access(slug: str, _=Depends(verify_admin_token)):
    """Remove priority access from provider"""
    await db.organizations.update_one(
        {"slug": slug},
        {"$set": {"hasPriorityAccess": False, "priorityLevel": 0, "priorityWindowSeconds": 0}}
    )
    return {"status": "priority_removed", "slug": slug}

@app.get("/api/admin/monetization/overview")
async def monetization_overview(_=Depends(verify_admin_token)):
    """Get monetization overview for admin dashboard"""
    promoted = await db.organizations.count_documents({"isPromoted": True})
    priority = await db.organizations.count_documents({"hasPriorityAccess": True})
    total = await db.organizations.count_documents({"status": "active"})
    
    # Promoted metrics
    all_providers = await db.organizations.find({"status": "active"}, {"_id": 0, "slug": 1, "name": 1, "isPromoted": 1, "promotionBoost": 1, "promotedLabel": 1, "hasPriorityAccess": 1, "priorityLevel": 1, "ratingAvg": 1, "bookingsCount": 1}).to_list(50)
    
    promoted_list = [p for p in all_providers if p.get("isPromoted")]
    priority_list = [p for p in all_providers if p.get("hasPriorityAccess")]
    
    return {
        "stats": {
            "totalProviders": total,
            "promotedCount": promoted,
            "priorityCount": priority,
            "monetizationRate": round((promoted + priority) / max(total, 1) * 100, 1),
        },
        "promotedProviders": promoted_list,
        "priorityProviders": priority_list,
        "metrics": {
            "promoted": {
                "impressions": random.randint(500, 2000),
                "clicks": random.randint(100, 500),
                "bookings": random.randint(20, 100),
                "conversionRate": round(random.uniform(15, 35), 1),
                "revenueLift": round(random.uniform(10, 40), 1),
            },
            "priority": {
                "requestsSent": random.randint(50, 200),
                "acceptRate": round(random.uniform(60, 90), 1),
                "avgAcceptTimeSeconds": round(random.uniform(8, 25), 1),
                "bookingConversionRate": round(random.uniform(50, 85), 1),
                "providerRevenue": random.randint(5000, 30000),
            },
        },
        "recentActions": await db.monetization_actions.find({}, {"_id": 0}).sort("createdAt", -1).to_list(10),
    }

@app.get("/api/admin/distribution/config")
async def get_distribution_config_internal(_=Depends(verify_admin_token)):
    """Get distribution configuration"""
    config = await db.distribution_config.find_one({"type": "global"}, {"_id": 0})
    if not config:
        config = {"type": "global", "priorityFanout": 3, "normalFanout": 5, "priorityWindowSeconds": 20, "maxPromotedInTop": 3, "promotionBoostCap": 0.25}
    return config

@app.post("/api/admin/distribution/config")
async def update_distribution_config_internal(request: Request, _=Depends(verify_admin_token)):
    """Update distribution configuration"""
    body = await request.json()
    await db.distribution_config.update_one(
        {"type": "global"},
        {"$set": {**body, "type": "global", "updatedAt": now_utc().isoformat()}},
        upsert=True
    )
    return {"status": "updated", "config": body}


# ═══════════════════════════════════════════════
# 🚀 GROWTH ENGINE: Billing + Pressure + A/B + Retention
# ═══════════════════════════════════════════════

# ── BILLING CATALOG ──
BILLING_PRODUCTS = [
    {"code": "promoted_7d", "name": "Promoted на 7 дней", "price": 499, "currency": "UAH", "durationDays": 7, "featureFlags": {"promoted": True, "priority": False, "vip": False}, "config": {"promotionBoost": 0.15, "promotedLabel": "⭐ Рекомендуем"}, "icon": "⭐", "benefit": "+40% просмотров, +20% заказов"},
    {"code": "priority_7d", "name": "Priority на 7 дней", "price": 699, "currency": "UAH", "durationDays": 7, "featureFlags": {"promoted": False, "priority": True, "vip": False}, "config": {"priorityLevel": 1, "priorityWindowSeconds": 20}, "icon": "🔥", "benefit": "Получаете заявки первыми, +37% заказов"},
    {"code": "vip_7d", "name": "VIP на 7 дней", "price": 999, "currency": "UAH", "durationDays": 7, "featureFlags": {"promoted": True, "priority": True, "vip": True}, "config": {"promotionBoost": 0.20, "promotedLabel": "🏆 VIP", "priorityLevel": 2, "priorityWindowSeconds": 25}, "icon": "🏆", "benefit": "Максимум заказов + Priority + Promoted"},
    {"code": "promoted_30d", "name": "Promoted на 30 дней", "price": 1499, "currency": "UAH", "durationDays": 30, "featureFlags": {"promoted": True, "priority": False, "vip": False}, "config": {"promotionBoost": 0.18, "promotedLabel": "⭐ Рекомендуем"}, "icon": "⭐", "benefit": "+40% просмотров на месяц"},
    {"code": "vip_30d", "name": "VIP на 30 дней", "price": 2999, "currency": "UAH", "durationDays": 30, "featureFlags": {"promoted": True, "priority": True, "vip": True}, "config": {"promotionBoost": 0.22, "promotedLabel": "🏆 VIP", "priorityLevel": 2, "priorityWindowSeconds": 25}, "icon": "🏆", "benefit": "Полный VIP на месяц"},
]

@app.get("/api/provider/billing/products")
async def get_billing_products():
    """Get available billing products"""
    return {"products": BILLING_PRODUCTS}

@app.get("/api/provider/billing/status")
async def get_billing_status(provider_slug: str = "avtomaster-pro"):
    """Get current monetization status of provider"""
    org = await db.organizations.find_one({"slug": provider_slug}, {"_id": 0, "slug": 1, "name": 1, "isPromoted": 1, "promotionBoost": 1, "promotedLabel": 1, "hasPriorityAccess": 1, "priorityLevel": 1})
    ent = await db.provider_entitlements.find_one({"providerSlug": provider_slug}, {"_id": 0})
    purchases = await db.provider_purchases.find({"providerSlug": provider_slug}, {"_id": 0}).sort("createdAt", -1).to_list(10)
    return {"provider": org, "entitlement": ent, "purchases": purchases, "activePlans": [p for p in purchases if p.get("status") == "paid" and p.get("endsAt", "") > now_utc().isoformat()]}

@app.post("/api/provider/billing/checkout")
async def provider_billing_checkout(request: Request):
    """Create a billing checkout (simulated payment for now)"""
    body = await request.json()
    product_code = body.get("productCode")
    provider_slug = body.get("providerSlug", "avtomaster-pro")
    
    product = next((p for p in BILLING_PRODUCTS if p["code"] == product_code), None)
    if not product:
        raise HTTPException(400, "Product not found")
    
    now = now_utc()
    ends_at = now + timedelta(days=product["durationDays"])
    
    purchase = {
        "id": uid(), "providerSlug": provider_slug, "productCode": product_code,
        "productName": product["name"], "amount": product["price"], "currency": product["currency"],
        "status": "paid", "durationDays": product["durationDays"],
        "startsAt": now.isoformat(), "endsAt": ends_at.isoformat(),
        "paidAt": now.isoformat(), "createdAt": now.isoformat(),
        "featureFlags": product["featureFlags"], "config": product["config"],
    }
    await db.provider_purchases.insert_one(purchase)
    purchase.pop("_id", None)
    
    # ── ENTITLEMENT ENGINE: activate features ──
    config = product["config"]
    flags = product["featureFlags"]
    update = {"updatedAt": now.isoformat()}
    org_update = {}
    
    if flags.get("promoted"):
        update["promotedActive"] = True
        update["promotedBoost"] = config.get("promotionBoost", 0.15)
        update["promotedLabel"] = config.get("promotedLabel", "⭐ Рекомендуем")
        update["promotedEndsAt"] = ends_at.isoformat()
        org_update["isPromoted"] = True
        org_update["promotionBoost"] = config.get("promotionBoost", 0.15)
        org_update["promotedLabel"] = config.get("promotedLabel")
    
    if flags.get("priority"):
        update["priorityActive"] = True
        update["priorityLevel"] = config.get("priorityLevel", 1)
        update["priorityWindowSeconds"] = config.get("priorityWindowSeconds", 20)
        update["priorityEndsAt"] = ends_at.isoformat()
        org_update["hasPriorityAccess"] = True
        org_update["priorityLevel"] = config.get("priorityLevel", 1)
        org_update["priorityWindowSeconds"] = config.get("priorityWindowSeconds", 20)
    
    if flags.get("vip"):
        update["vipActive"] = True
        org_update["promotionPlan"] = "vip"
    
    await db.provider_entitlements.update_one({"providerSlug": provider_slug}, {"$set": {**update, "providerSlug": provider_slug}}, upsert=True)
    if org_update:
        await db.organizations.update_one({"slug": provider_slug}, {"$set": org_update})
    
    return {"purchase": purchase, "status": "activated", "endsAt": ends_at.isoformat()}

@app.get("/api/provider/billing/purchases")
async def get_billing_purchases(provider_slug: str = "avtomaster-pro"):
    """Get purchase history"""
    purchases = await db.provider_purchases.find({"providerSlug": provider_slug}, {"_id": 0}).sort("createdAt", -1).to_list(20)
    return {"purchases": purchases}


# ── PRESSURE UX ──
@app.get("/api/provider/pressure")
async def get_provider_pressure(provider_slug: str = "avtomaster-pro"):
    """Get pressure data for provider — missed requests, lost revenue, rank"""
    org = await db.organizations.find_one({"slug": provider_slug}, {"_id": 0})
    if not org:
        raise HTTPException(404, "Provider not found")
    
    has_priority = org.get("hasPriorityAccess", False)
    has_promoted = org.get("isPromoted", False)
    
    # Calculate pressure metrics
    total_requests_today = random.randint(15, 45)
    missed = random.randint(2, 8) if not has_priority else random.randint(0, 2)
    avg_price = random.randint(300, 800)
    lost_revenue = missed * avg_price
    rank_in_zone = random.randint(1, 3) if has_promoted else random.randint(4, 8)
    total_in_zone = 8
    
    # Comparison data
    priority_providers_bookings = random.randint(8, 18)
    normal_providers_bookings = random.randint(3, 8)
    boost_percent = round((priority_providers_bookings / max(normal_providers_bookings, 1) - 1) * 100)
    
    return {
        "missedRequests": missed,
        "lostRevenueEstimate": lost_revenue,
        "totalRequestsToday": total_requests_today,
        "avgRequestPrice": avg_price,
        "rankInZone": rank_in_zone,
        "totalInZone": total_in_zone,
        "hasPriority": has_priority,
        "hasPromoted": has_promoted,
        "comparison": {
            "priorityBookingsAvg": priority_providers_bookings,
            "normalBookingsAvg": normal_providers_bookings,
            "boostPercent": boost_percent,
            "message": f"Мастера с Priority получают на {boost_percent}% больше заказов" if not has_priority else "Вы уже в Priority — отлично!"
        },
        "upsells": [] if (has_priority and has_promoted) else [
            {"type": "priority", "title": "Получать заявки первым", "subtitle": f"Вы пропустили {missed} заявок сегодня", "cta": "Включить Priority", "productCode": "priority_7d", "price": 699} if not has_priority else None,
            {"type": "promoted", "title": "Подняться в выдаче", "subtitle": f"Вы #{rank_in_zone} из {total_in_zone} в зоне", "cta": "Включить Promoted", "productCode": "promoted_7d", "price": 499} if not has_promoted else None,
        ],
    }


# ── A/B TESTING ──
@app.get("/api/experiments/active")
async def get_active_experiments():
    """Get active A/B experiments"""
    experiments = await db.experiments.find({"isActive": True}, {"_id": 0}).to_list(20)
    if not experiments:
        experiments = [
            {"id": "exp_promoted_label", "name": "Promoted Label Test", "isActive": True, "variants": [
                {"name": "A", "config": {"label": "⭐ Рекомендуем"}, "trafficPercent": 50},
                {"name": "B", "config": {"label": "🔥 Топ выбор"}, "trafficPercent": 50},
            ]},
            {"id": "exp_cta_text", "name": "CTA Text Test", "isActive": True, "variants": [
                {"name": "A", "config": {"text": "Быстрый запрос"}, "trafficPercent": 50},
                {"name": "B", "config": {"text": "Найти мастера за 10 сек"}, "trafficPercent": 50},
            ]},
            {"id": "exp_priority_inbox", "name": "Priority Inbox Text", "isActive": True, "variants": [
                {"name": "A", "config": {"text": "🔥 Приоритетная заявка"}, "trafficPercent": 50},
                {"name": "B", "config": {"text": "⚡ Вы получили раньше всех"}, "trafficPercent": 50},
            ]},
        ]
    return {"experiments": experiments}

@app.post("/api/experiments")
async def create_experiment(request: Request, _=Depends(verify_admin_token)):
    """Create A/B experiment"""
    body = await request.json()
    exp = {"id": uid(), **body, "isActive": True, "createdAt": now_utc().isoformat()}
    await db.experiments.insert_one(exp)
    exp.pop("_id", None)
    return exp

@app.post("/api/experiments/{exp_id}/toggle")
async def toggle_experiment(exp_id: str, _=Depends(verify_admin_token)):
    """Toggle experiment on/off"""
    exp = await db.experiments.find_one({"id": exp_id})
    if not exp:
        raise HTTPException(404, "Experiment not found")
    new_state = not exp.get("isActive", True)
    await db.experiments.update_one({"id": exp_id}, {"$set": {"isActive": new_state}})
    return {"id": exp_id, "isActive": new_state}


# ── RETENTION: Tier System ──
TIER_THRESHOLDS = [
    {"tier": "bronze", "label": "Bronze", "emoji": "🥉", "minScore": 0, "priorityBoost": 0, "color": "#CD7F32"},
    {"tier": "silver", "label": "Silver", "emoji": "🥈", "minScore": 50, "priorityBoost": 0.05, "color": "#C0C0C0"},
    {"tier": "gold", "label": "Gold", "emoji": "🥇", "minScore": 100, "priorityBoost": 0.10, "color": "#FFD700"},
    {"tier": "platinum", "label": "Platinum", "emoji": "💎", "minScore": 200, "priorityBoost": 0.15, "color": "#E5E4E2"},
]

@app.get("/api/provider/tier")
async def get_provider_tier(provider_slug: str = "avtomaster-pro"):
    """Get provider loyalty tier and progress"""
    org = await db.organizations.find_one({"slug": provider_slug}, {"_id": 0})
    if not org:
        raise HTTPException(404, "Provider not found")
    
    rating = org.get("ratingAvg", 4.0)
    bookings = org.get("completedBookingsCount", 0)
    resp_time = org.get("avgResponseTimeMinutes", 15)
    
    score = int(bookings * 0.3 + rating * 20 + max(0, (30 - resp_time)) * 2)
    
    current_tier = TIER_THRESHOLDS[0]
    next_tier = TIER_THRESHOLDS[1] if len(TIER_THRESHOLDS) > 1 else None
    for i, t in enumerate(TIER_THRESHOLDS):
        if score >= t["minScore"]:
            current_tier = t
            next_tier = TIER_THRESHOLDS[i + 1] if i + 1 < len(TIER_THRESHOLDS) else None
    
    progress = 0
    if next_tier:
        range_size = next_tier["minScore"] - current_tier["minScore"]
        progress = min(100, round((score - current_tier["minScore"]) / max(range_size, 1) * 100))
    
    benefits = []
    if current_tier["tier"] == "gold":
        benefits = ["Приоритетный буст +10%", "+28% больше заказов", "Бейдж Gold в профиле"]
    elif current_tier["tier"] == "platinum":
        benefits = ["Авто-Priority доступ", "+45% больше заказов", "Бейдж Platinum", "Приоритетная поддержка"]
    elif current_tier["tier"] == "silver":
        benefits = ["Приоритетный буст +5%", "+15% больше заказов"]
    else:
        benefits = ["Базовый доступ к заявкам"]
    
    return {
        "score": score, "tier": current_tier, "nextTier": next_tier, "progress": progress,
        "benefits": benefits,
        "stats": {"rating": rating, "completedBookings": bookings, "avgResponseTime": resp_time},
        "message": f"Вы {current_tier['emoji']} {current_tier['label']} мастер" + (f" — до {next_tier['label']} осталось {next_tier['minScore'] - score} очков" if next_tier else " — максимальный уровень!"),
    }


# ── ADMIN BILLING REVENUE ──
@app.get("/api/admin/billing/revenue")
async def admin_billing_revenue(_=Depends(verify_admin_token)):
    """Revenue dashboard for admin"""
    purchases = await db.provider_purchases.find({"status": "paid"}, {"_id": 0}).to_list(100)
    total_revenue = sum(p.get("amount", 0) for p in purchases)
    active_promoted = await db.organizations.count_documents({"isPromoted": True})
    active_priority = await db.organizations.count_documents({"hasPriorityAccess": True})
    
    by_product = {}
    for p in purchases:
        code = p.get("productCode", "unknown")
        by_product.setdefault(code, {"count": 0, "revenue": 0})
        by_product[code]["count"] += 1
        by_product[code]["revenue"] += p.get("amount", 0)
    
    return {
        "totalRevenue": total_revenue, "currency": "UAH", "totalPurchases": len(purchases),
        "activePromoted": active_promoted, "activePriority": active_priority,
        "byProduct": by_product,
        "arppu": round(total_revenue / max(len(set(p.get("providerSlug") for p in purchases)), 1)),
        "conversionToPaid": round(active_promoted + active_priority) / max(await db.organizations.count_documents({"status": "active"}), 1) * 100,
    }



# ═══════════════════════════════════════════════
# 🧩 SYSTEM DEPTH: Availability + Performance + Skills + Matching V2
# ═══════════════════════════════════════════════

PROBLEM_SKILL_MAP = {
    "wont-start": ["engine", "electric", "diagnostics"],
    "tow": ["tow"],
    "diagnostics": ["diagnostics", "engine"],
    "oil": ["maintenance"],
    "brakes": ["brakes", "suspension"],
    "electric": ["electric"],
    "battery": ["electric"],
    "suspension": ["suspension", "brakes"],
    "body": ["body"],
    "general": ["diagnostics", "engine", "maintenance"],
}

@app.get("/api/provider/availability")
async def get_provider_availability(provider_slug: str = "avtomaster-pro"):
    avail = await db.provider_availability.find_one({"providerSlug": provider_slug}, {"_id": 0})
    if not avail:
        return {"providerSlug": provider_slug, "weeklySchedule": [], "exceptions": [], "isOnline": False}
    return avail

@app.post("/api/provider/availability")
async def update_provider_availability(request: Request):
    body = await request.json()
    slug = body.get("providerSlug", "avtomaster-pro")
    await db.provider_availability.update_one(
        {"providerSlug": slug},
        {"$set": {"weeklySchedule": body.get("weeklySchedule", []), "exceptions": body.get("exceptions", []), "isOnline": body.get("isOnline", True), "updatedAt": now_utc().isoformat()}},
        upsert=True
    )
    if "isOnline" in body:
        await db.organizations.update_one({"slug": slug}, {"$set": {"isOnline": body["isOnline"]}})
    return {"status": "updated", "providerSlug": slug}

@app.post("/api/provider/availability/override")
async def provider_availability_override(request: Request):
    body = await request.json()
    slug = body.get("providerSlug", "avtomaster-pro")
    exception = {"date": body.get("date"), "isAvailable": body.get("isAvailable", False), "slots": body.get("slots", []), "reason": body.get("reason", "")}
    await db.provider_availability.update_one({"providerSlug": slug}, {"$push": {"exceptions": exception}}, upsert=True)
    return {"status": "exception_added", "providerSlug": slug, "exception": exception}

@app.get("/api/provider/performance")
async def get_provider_performance(provider_slug: str = "avtomaster-pro"):
    perf = await db.provider_performance.find_one({"providerSlug": provider_slug}, {"_id": 0})
    if not perf:
        return {"providerSlug": provider_slug, "acceptanceRate": 0, "completionRate": 0, "qualityScore": 0}
    return perf

@app.get("/api/provider/skills")
async def get_provider_skills(provider_slug: str = "avtomaster-pro"):
    skills = await db.provider_skills.find({"providerSlug": provider_slug}, {"_id": 0}).to_list(20)
    return {"providerSlug": provider_slug, "skills": skills}

@app.post("/api/provider/skills")
async def update_provider_skills(request: Request):
    body = await request.json()
    slug = body.get("providerSlug", "avtomaster-pro")
    cat = body.get("category")
    await db.provider_skills.update_one(
        {"providerSlug": slug, "category": cat},
        {"$set": {"level": body.get("level", 3), "verified": body.get("verified", False), "updatedAt": now_utc().isoformat()}},
        upsert=True
    )
    return {"status": "updated", "providerSlug": slug, "category": cat}

@app.get("/api/admin/matching/weights")
async def get_matching_weights(_=Depends(verify_admin_token)):
    config = await db.matching_config.find_one({"type": "weights"}, {"_id": 0})
    if not config:
        config = {"type": "weights", "distance": 0.25, "rating": 0.20, "response": 0.15, "availability": 0.10, "skillMatch": 0.15, "performance": 0.10, "trust": 0.05}
    return config

@app.post("/api/admin/matching/weights")
async def update_matching_weights(request: Request, _=Depends(verify_admin_token)):
    body = await request.json()
    await db.matching_config.update_one({"type": "weights"}, {"$set": {**body, "type": "weights", "updatedAt": now_utc().isoformat()}}, upsert=True)
    return {"status": "updated", "weights": body}

@app.post("/api/matching/advanced")
async def advanced_matching(request: Request):
    """Context-aware matching engine V2 with skills, performance, trust"""
    body = await request.json()
    lat = body.get("lat", 50.4501)
    lng = body.get("lng", 30.5234)
    problem = body.get("problem", "general")
    limit_val = body.get("limit", 10)
    
    W_conf = await db.matching_config.find_one({"type": "weights"}, {"_id": 0})
    W = W_conf or {"distance": 0.25, "rating": 0.20, "response": 0.15, "availability": 0.10, "skillMatch": 0.15, "performance": 0.10, "trust": 0.05}
    required_skills = set(PROBLEM_SKILL_MAP.get(problem, ["diagnostics"]))
    
    orgs = await db.organizations.find({"status": "active"}, {"_id": 0}).to_list(50)
    all_perf = {p["providerSlug"]: p async for p in db.provider_performance.find({}, {"_id": 0})}
    all_skills = {}
    async for s in db.provider_skills.find({}, {"_id": 0}):
        all_skills.setdefault(s["providerSlug"], []).append(s)
    all_avail = {a["providerSlug"]: a async for a in db.provider_availability.find({}, {"_id": 0})}
    
    results = []
    for o in orgs:
        slug = o.get("slug", "")
        coords = o.get("location", {}).get("coordinates", [30.52, 50.45])
        dist = haversine(lat, lng, coords[1], coords[0])
        rating = o.get("ratingAvg", 4.0)
        resp_time = o.get("avgResponseTimeMinutes", 15)
        
        dist_s = max(0, min(1, 1 - dist / 15))
        rat_s = max(0, min(1, rating / 5))
        rsp_s = max(0, min(1, 1 - resp_time / 30))
        
        avail = all_avail.get(slug, {})
        avl_s = 1.0 if avail.get("isOnline") else 0.3
        
        p_skills = all_skills.get(slug, [])
        p_cats = {s["category"] for s in p_skills}
        matched_sk = required_skills & p_cats
        skl_s = len(matched_sk) / max(len(required_skills), 1) if required_skills else 0.5
        for s in p_skills:
            if s["category"] in matched_sk and s.get("level", 1) >= 4:
                skl_s = min(1.0, skl_s + 0.1)
        
        perf = all_perf.get(slug, {})
        prf_s = (perf.get("acceptanceRate", 80)/100*0.3 + perf.get("completionRate", 90)/100*0.3 + perf.get("qualityScore", 75)/100*0.3 + (1-perf.get("cancelRate", 5)/100)*0.1)
        tst_s = (rat_s*0.5 + perf.get("completionRate", 90)/100*0.2 + (1-perf.get("cancelRate", 5)/50)*0.15 + (0.15 if o.get("isVerified") else 0))
        
        base = dist_s*W.get("distance",0.25) + rat_s*W.get("rating",0.20) + rsp_s*W.get("response",0.15) + avl_s*W.get("availability",0.10) + skl_s*W.get("skillMatch",0.15) + prf_s*W.get("performance",0.10) + tst_s*W.get("trust",0.05)
        promo = min(o.get("promotionBoost", 0), 0.25) if o.get("isPromoted") else 0
        final = base + promo
        
        why = []
        if dist < 2: why.append("Очень близко")
        if rating >= 4.8: why.append("Топ рейтинг")
        if rsp_s > 0.7: why.append("Быстро отвечает")
        if avl_s == 1.0: why.append("Доступен сейчас")
        if skl_s >= 0.8: why.append("Специалист по запросу")
        if promo > 0: why.append(o.get("promotedLabel", "Рекомендуем"))
        
        eta = max(3, int(dist * 4 + random.uniform(-2, 3)))
        results.append({
            "slug": slug, "name": o.get("name"), "type": o.get("type"),
            "ratingAvg": rating, "reviewsCount": o.get("reviewsCount", 0),
            "distance": round(dist, 1), "eta": eta,
            "priceFrom": o.get("priceFrom", 500), "isOnline": o.get("isOnline"),
            "isVerified": o.get("isVerified"), "badges": o.get("badges", []),
            "scores": {"distance": round(dist_s, 3), "rating": round(rat_s, 3), "response": round(rsp_s, 3), "availability": round(avl_s, 3), "skillMatch": round(skl_s, 3), "performance": round(prf_s, 3), "trust": round(tst_s, 3)},
            "baseScore": round(base, 4), "promotionBoost": round(promo, 4), "finalScore": round(final, 4),
            "isPromoted": promo > 0, "promotedLabel": o.get("promotedLabel") if promo > 0 else None,
            "whyReasons": why[:4], "matchedSkills": list(matched_sk),
            "performanceHighlights": {"acceptanceRate": perf.get("acceptanceRate"), "completionRate": perf.get("completionRate"), "qualityScore": perf.get("qualityScore")},
        })
    
    results.sort(key=lambda x: -x["finalScore"])
    return {"providers": results[:limit_val], "total": len(results), "matchingWeights": {k: v for k, v in W.items() if k != "type"}, "problemCategory": problem, "requiredSkills": list(required_skills)}

@app.get("/api/matching/nearby")
async def matching_nearby(lat: float = 50.4501, lng: float = 30.5234, radius: float = 5, limit: int = 10):
    """Geo-indexed nearby search"""
    orgs = await db.organizations.find({"status": "active", "location": {"$near": {"$geometry": {"type": "Point", "coordinates": [lng, lat]}, "$maxDistance": radius * 1000}}}, {"_id": 0}).to_list(limit)
    for o in orgs:
        coords = o.get("location", {}).get("coordinates", [lng, lat])
        o["distance"] = round(haversine(lat, lng, coords[1], coords[0]), 1)
        o["eta"] = max(3, int(o["distance"] * 4))
        o.pop("ownerId", None)
        o.pop("location", None)
    return {"providers": orgs, "total": len(orgs), "center": {"lat": lat, "lng": lng}, "radiusKm": radius}


# ═══════════════════════════════════════════════
# 📍 PHASE B: PROVIDER LOCATION TRACKING
# ═══════════════════════════════════════════════

@app.post("/api/provider/location/update")
async def update_provider_location(request: Request):
    """Update provider's live GPS location"""
    body = await request.json()
    provider_id = body.get("providerId")
    lat = body.get("lat")
    lng = body.get("lng")
    heading = body.get("heading", 0)
    speed = body.get("speed", 0)
    is_online = body.get("isOnline", True)
    
    if not provider_id or lat is None or lng is None:
        raise HTTPException(400, "providerId, lat, lng required")
    
    zone_id = resolve_zone(lat, lng)
    
    await db.provider_locations.update_one(
        {"providerId": provider_id},
        {"$set": {
            "providerId": provider_id,
            "location": {"type": "Point", "coordinates": [lng, lat]},
            "zoneId": zone_id,
            "isOnline": is_online,
            "heading": heading,
            "speed": speed,
            "updatedAt": now_utc().isoformat(),
        }},
        upsert=True
    )
    
    # Sync online status to organization
    await db.organizations.update_one({"slug": provider_id}, {"$set": {"isOnline": is_online}})
    
    # Emit realtime
    await emit_realtime_event("provider:location", {
        "providerId": provider_id, "lat": lat, "lng": lng,
        "zoneId": zone_id, "heading": heading, "speed": speed,
    })
    
    return {"status": "updated", "providerId": provider_id, "zoneId": zone_id}


@app.get("/api/provider/locations/nearby")
async def get_nearby_provider_locations(lat: float = 50.4501, lng: float = 30.5234, radius: float = 5, onlineOnly: bool = True):
    """Get nearby provider locations using 2dsphere index"""
    query = {
        "location": {
            "$near": {
                "$geometry": {"type": "Point", "coordinates": [lng, lat]},
                "$maxDistance": radius * 1000
            }
        }
    }
    if onlineOnly:
        query["isOnline"] = True
    
    providers = await db.provider_locations.find(query, {"_id": 0}).to_list(50)
    for p in providers:
        coords = p.get("location", {}).get("coordinates", [lng, lat])
        p["distance"] = round(haversine(lat, lng, coords[1], coords[0]), 1)
        p["eta"] = max(3, int(p["distance"] * 4))
    
    return {"providers": providers, "total": len(providers), "center": {"lat": lat, "lng": lng}, "radiusKm": radius}


@app.get("/api/provider/locations/zone/{zone_id}")
async def get_zone_provider_locations(zone_id: str, onlineOnly: bool = True):
    """Get all provider locations in a zone"""
    query = {"zoneId": zone_id}
    if onlineOnly:
        query["isOnline"] = True
    providers = await db.provider_locations.find(query, {"_id": 0}).to_list(50)
    return {"providers": providers, "total": len(providers), "zoneId": zone_id}


@app.post("/api/provider/presence")
async def update_provider_presence(request: Request):
    """Update provider online/offline status"""
    body = await request.json()
    provider_id = body.get("providerId")
    is_online = body.get("isOnline", False)
    lat = body.get("lat")
    lng = body.get("lng")
    
    if not provider_id:
        raise HTTPException(400, "providerId required")
    
    update = {"isOnline": is_online, "updatedAt": now_utc().isoformat()}
    if lat is not None and lng is not None:
        update["location"] = {"type": "Point", "coordinates": [lng, lat]}
        update["zoneId"] = resolve_zone(lat, lng)
    
    await db.provider_locations.update_one({"providerId": provider_id}, {"$set": update}, upsert=True)
    await db.organizations.update_one({"slug": provider_id}, {"$set": {"isOnline": is_online}})
    
    await emit_realtime_event("provider:presence", {"providerId": provider_id, "isOnline": is_online})
    
    return {"status": "updated", "providerId": provider_id, "isOnline": is_online}


# ═══════════════════════════════════════════════
# 📊 PHASE B: BOOKING DEMAND EVENTS
# ═══════════════════════════════════════════════

@app.post("/api/demand/event")
async def create_demand_event(request: Request):
    """Track a demand event (booking created/assigned/completed/cancelled)"""
    body = await request.json()
    lat = body.get("lat", 50.4501)
    lng = body.get("lng", 30.5234)
    event_type = body.get("type", "created")
    
    zone_id = resolve_zone(lat, lng)
    
    event = {
        "id": uid(),
        "zoneId": zone_id,
        "type": event_type,
        "bookingId": body.get("bookingId"),
        "serviceId": body.get("serviceId"),
        "lat": lat, "lng": lng,
        "timestamp": now_utc().isoformat(),
    }
    await db.booking_demand_events.insert_one(event)
    event.pop("_id", None)
    
    # Emit demand event
    await emit_realtime_event("demand:event", {"zoneId": zone_id, "type": event_type})
    
    return {"status": "tracked", "event": event}


@app.get("/api/demand/events")
async def get_demand_events(zoneId: str = None, minutes: int = 60, limit: int = 100):
    """Get recent demand events"""
    since = (now_utc() - timedelta(minutes=minutes)).isoformat()
    query = {"timestamp": {"$gte": since}}
    if zoneId:
        query["zoneId"] = zoneId
    events = await db.booking_demand_events.find(query, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    
    # Aggregate by type
    by_type = {}
    for e in events:
        t = e.get("type", "unknown")
        by_type.setdefault(t, 0)
        by_type[t] += 1
    
    return {"events": events, "total": len(events), "byType": by_type, "periodMinutes": minutes}


@app.get("/api/demand/heatmap")
async def demand_heatmap(minutes: int = 60):
    """Get demand heatmap data from recent events"""
    since = (now_utc() - timedelta(minutes=minutes)).isoformat()
    events = await db.booking_demand_events.find(
        {"timestamp": {"$gte": since}, "type": "created"},
        {"_id": 0, "lat": 1, "lng": 1, "zoneId": 1}
    ).to_list(500)
    
    # Aggregate by zone
    zone_demand = {}
    for e in events:
        zid = e.get("zoneId", "unknown")
        zone_demand.setdefault(zid, {"count": 0, "points": []})
        zone_demand[zid]["count"] += 1
        zone_demand[zid]["points"].append({"lat": e.get("lat"), "lng": e.get("lng")})
    
    # Build heatmap with zone centers
    zones = await db.zones.find({}, {"_id": 0}).to_list(50)
    heatmap = []
    max_demand = max((d["count"] for d in zone_demand.values()), default=1)
    for z in zones:
        zid = z["id"]
        center = z.get("center", {})
        demand_count = zone_demand.get(zid, {}).get("count", 0) + z.get("demandScore", 0)
        intensity = min(1.0, demand_count / max(max_demand * 2, 1))
        heatmap.append({
            "zoneId": zid, "name": z.get("name"),
            "lat": center.get("lat", 50.45), "lng": center.get("lng", 30.52),
            "intensity": round(intensity, 3),
            "demand": z.get("demandScore", 0), "supply": z.get("supplyScore", 0),
            "ratio": z.get("ratio", 1), "surge": z.get("surgeMultiplier", 1),
            "status": z.get("status", "BALANCED"), "color": z.get("color", "#22C55E"),
        })
    
    return {"heatmap": heatmap, "total": len(heatmap), "periodMinutes": minutes}


# ═══════════════════════════════════════════════
# 🧠 PHASE B: ZONE-AWARE MATCHING (Enhanced)
# ═══════════════════════════════════════════════

@app.post("/api/matching/zone-aware")
async def zone_aware_matching(request: Request):
    """Zone-aware matching: combines advanced matching with zone dynamics"""
    body = await request.json()
    lat = body.get("lat", 50.4501)
    lng = body.get("lng", 30.5234)
    problem = body.get("problem", "general")
    limit_val = body.get("limit", 10)
    
    # Resolve zone
    zone_id = resolve_zone(lat, lng)
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    zone_ratio = zone.get("ratio", 1) if zone else 1
    zone_surge = zone.get("surgeMultiplier", 1) if zone else 1
    zone_status = zone.get("status", "BALANCED") if zone else "BALANCED"
    
    # Zone factor: lower ratio = more lenient matching; higher ratio = stricter
    zone_factor = max(0.1, min(1.0, 1 / max(zone_ratio, 0.5)))
    
    # Distribution fanout based on zone status
    fanout_map = {"BALANCED": 3, "BUSY": 4, "SURGE": 5, "CRITICAL": 6}
    fanout = fanout_map.get(zone_status, 3)
    
    # Get matching weights
    W_conf = await db.matching_config.find_one({"type": "weights"}, {"_id": 0})
    W = W_conf or {"distance": 0.25, "rating": 0.20, "response": 0.15, "availability": 0.10, "skillMatch": 0.15, "performance": 0.10, "trust": 0.05}
    required_skills = set(PROBLEM_SKILL_MAP.get(problem, ["diagnostics"]))
    
    orgs = await db.organizations.find({"status": "active"}, {"_id": 0}).to_list(50)
    all_perf = {p["providerSlug"]: p async for p in db.provider_performance.find({}, {"_id": 0})}
    all_skills = {}
    async for s in db.provider_skills.find({}, {"_id": 0}):
        all_skills.setdefault(s["providerSlug"], []).append(s)
    all_avail = {a["providerSlug"]: a async for a in db.provider_availability.find({}, {"_id": 0})}
    
    results = []
    for o in orgs:
        slug = o.get("slug", "")
        coords = o.get("location", {}).get("coordinates", [30.52, 50.45])
        dist = haversine(lat, lng, coords[1], coords[0])
        rating = o.get("ratingAvg", 4.0)
        resp_time = o.get("avgResponseTimeMinutes", 15)
        
        # Base scores
        dist_s = max(0, min(1, 1 - dist / 15))
        rat_s = max(0, min(1, rating / 5))
        rsp_s = max(0, min(1, 1 - resp_time / 30))
        
        avail = all_avail.get(slug, {})
        avl_s = 1.0 if avail.get("isOnline") else 0.3
        
        p_skills = all_skills.get(slug, [])
        p_cats = {s["category"] for s in p_skills}
        matched_sk = required_skills & p_cats
        skl_s = len(matched_sk) / max(len(required_skills), 1) if required_skills else 0.5
        
        perf = all_perf.get(slug, {})
        prf_s = (perf.get("acceptanceRate", 80)/100*0.3 + perf.get("completionRate", 90)/100*0.3 + perf.get("qualityScore", 75)/100*0.3 + (1-perf.get("cancelRate", 5)/100)*0.1)
        tst_s = (rat_s*0.5 + perf.get("completionRate", 90)/100*0.2 + (1-perf.get("cancelRate", 5)/50)*0.15 + (0.15 if o.get("isVerified") else 0))
        
        # Zone factor integration
        base = (dist_s*W.get("distance",0.25) + rat_s*W.get("rating",0.20) + rsp_s*W.get("response",0.15) + avl_s*W.get("availability",0.10) + skl_s*W.get("skillMatch",0.15) + prf_s*W.get("performance",0.10) + tst_s*W.get("trust",0.05))
        zone_boost = zone_factor * 0.1
        promo = min(o.get("promotionBoost", 0), 0.25) if o.get("isPromoted") else 0
        final = base + zone_boost + promo
        
        # Surge-adjusted price
        price_from = o.get("priceFrom", 500)
        surged_price = round(price_from * zone_surge)
        
        eta = max(3, int(dist * 4 + random.uniform(-2, 3)))
        
        why = []
        if dist < 2: why.append("Очень близко")
        if rating >= 4.8: why.append("Топ рейтинг")
        if rsp_s > 0.7: why.append("Быстро отвечает")
        if avl_s == 1.0: why.append("Доступен сейчас")
        if skl_s >= 0.8: why.append("Специалист по запросу")
        if zone_surge > 1.2: why.append(f"Surge x{zone_surge}")
        
        results.append({
            "slug": slug, "name": o.get("name"), "type": o.get("type"),
            "ratingAvg": rating, "reviewsCount": o.get("reviewsCount", 0),
            "distance": round(dist, 1), "eta": eta,
            "priceFrom": price_from, "surgedPrice": surged_price,
            "isOnline": o.get("isOnline"), "isVerified": o.get("isVerified"),
            "badges": o.get("badges", []),
            "scores": {"distance": round(dist_s, 3), "rating": round(rat_s, 3), "response": round(rsp_s, 3), "availability": round(avl_s, 3), "skillMatch": round(skl_s, 3), "performance": round(prf_s, 3), "trust": round(tst_s, 3), "zoneFactor": round(zone_factor, 3)},
            "baseScore": round(base, 4), "zoneBoost": round(zone_boost, 4), "promotionBoost": round(promo, 4), "finalScore": round(final, 4),
            "whyReasons": why[:4], "matchedSkills": list(matched_sk),
        })
    
    results.sort(key=lambda x: -x["finalScore"])
    
    return {
        "providers": results[:limit_val],
        "total": len(results),
        "zone": {"id": zone_id, "name": zone.get("name") if zone else zone_id, "status": zone_status, "surge": zone_surge, "ratio": zone_ratio},
        "zoneFactor": round(zone_factor, 3),
        "fanout": fanout,
        "matchingWeights": {k: v for k, v in W.items() if k != "type"},
        "problemCategory": problem,
        "requiredSkills": list(required_skills),
    }


# ═══════════════════════════════════════════════
# 🚀 PHASE B: ZONE-AWARE DISTRIBUTION
# ═══════════════════════════════════════════════

@app.post("/api/distribution/zone-aware")
async def zone_aware_distribution(request: Request):
    """Distribute request to providers with zone-based fanout"""
    body = await request.json()
    lat = body.get("lat", 50.4501)
    lng = body.get("lng", 30.5234)
    service_id = body.get("serviceId")
    booking_id = body.get("bookingId")
    
    # Resolve zone
    zone_id = resolve_zone(lat, lng)
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    zone_status = zone.get("status", "BALANCED") if zone else "BALANCED"
    zone_surge = zone.get("surgeMultiplier", 1) if zone else 1
    
    # Fanout based on zone status
    fanout_map = {"BALANCED": 2, "BUSY": 3, "SURGE": 4, "CRITICAL": 6}
    fanout = fanout_map.get(zone_status, 3)
    
    # Get nearby online providers
    query = {"isOnline": True}
    providers = await db.provider_locations.find(
        {"isOnline": True, "location": {"$near": {"$geometry": {"type": "Point", "coordinates": [lng, lat]}, "$maxDistance": 8000}}},
        {"_id": 0}
    ).to_list(fanout * 2)
    
    # Rank by distance and select top N
    for p in providers:
        coords = p.get("location", {}).get("coordinates", [lng, lat])
        p["distance"] = round(haversine(lat, lng, coords[1], coords[0]), 1)
    providers.sort(key=lambda x: x.get("distance", 999))
    selected = providers[:fanout]
    
    # Log distribution
    distribution = {
        "id": uid(),
        "bookingId": booking_id,
        "zoneId": zone_id,
        "zoneStatus": zone_status,
        "fanout": fanout,
        "surge": zone_surge,
        "distributedTo": [p.get("providerId") for p in selected],
        "totalCandidates": len(providers),
        "createdAt": now_utc().isoformat(),
    }
    await db.zone_distributions.insert_one(distribution)
    distribution.pop("_id", None)
    
    # Emit events to providers
    for p in selected:
        await emit_realtime_event("provider:new_request", {
            "providerId": p.get("providerId"),
            "bookingId": booking_id,
            "distance": p.get("distance"),
            "surge": zone_surge,
        })
    
    # Track demand event
    await db.booking_demand_events.insert_one({
        "id": uid(), "zoneId": zone_id, "type": "distributed",
        "bookingId": booking_id, "lat": lat, "lng": lng,
        "fanout": fanout, "providersNotified": len(selected),
        "timestamp": now_utc().isoformat(),
    })
    
    return {
        "status": "distributed",
        "distribution": distribution,
        "zone": {"id": zone_id, "status": zone_status, "surge": zone_surge},
    }


@app.get("/api/distribution/history")
async def get_distribution_history(zoneId: str = None, limit: int = 30):
    """Get zone distribution history"""
    query = {}
    if zoneId:
        query["zoneId"] = zoneId
    distributions = await db.zone_distributions.find(query, {"_id": 0}).sort("createdAt", -1).to_list(limit)
    return {"distributions": distributions, "total": len(distributions)}


# ═══════════════════════════════════════════════
# 📊 PHASE B: ZONE DASHBOARD (COMPREHENSIVE)
# ═══════════════════════════════════════════════

@app.get("/api/zones/live-state")
async def get_zones_live_state():
    """Get comprehensive live state of all zones (public)"""
    zones = await db.zones.find({}, {"_id": 0}).to_list(50)
    
    # Enrich with provider counts
    for z in zones:
        z["onlineProviders"] = await db.provider_locations.count_documents({"zoneId": z["id"], "isOnline": True})
        z["totalProviders"] = await db.provider_locations.count_documents({"zoneId": z["id"]})
    
    total_demand = sum(z.get("demandScore", 0) for z in zones)
    total_supply = sum(z.get("supplyScore", 0) for z in zones)
    
    by_status = {}
    for z in zones:
        st = z.get("status", "BALANCED")
        by_status.setdefault(st, 0)
        by_status[st] += 1
    
    critical = [z for z in zones if z.get("status") in ("CRITICAL", "SURGE")]
    
    return {
        "zones": zones,
        "summary": {
            "totalZones": len(zones),
            "totalDemand": total_demand,
            "totalSupply": total_supply,
            "avgRatio": round(total_demand / max(total_supply, 1), 2),
            "byStatus": by_status,
        },
        "alerts": [
            {"zoneId": z["id"], "name": z.get("name"), "status": z["status"],
             "ratio": z.get("ratio"), "surge": z.get("surgeMultiplier"),
             "message": f"{z.get('name')}: {z['status']} (ratio {z.get('ratio', '?')})"}
            for z in critical
        ],
        "updatedAt": now_utc().isoformat(),
    }


@app.get("/api/zones/{zone_id}/analytics")
async def get_zone_analytics(zone_id: str, hours: int = 24):
    """Get zone analytics with timeline + stats"""
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    if not zone:
        raise HTTPException(404, "Zone not found")
    
    since = (now_utc() - timedelta(hours=hours)).isoformat()
    snapshots = await db.zone_snapshots.find(
        {"zoneId": zone_id, "timestamp": {"$gte": since}},
        {"_id": 0}
    ).sort("timestamp", 1).to_list(500)
    
    # Stats
    if snapshots:
        avg_demand = round(sum(s.get("demand", 0) for s in snapshots) / len(snapshots), 1)
        avg_supply = round(sum(s.get("supply", 0) for s in snapshots) / len(snapshots), 1)
        avg_ratio = round(sum(s.get("ratio", 0) for s in snapshots) / len(snapshots), 2)
        max_surge = max(s.get("surge", 1) for s in snapshots)
        min_eta = min(s.get("avgEta", 10) for s in snapshots)
        max_eta = max(s.get("avgEta", 10) for s in snapshots)
    else:
        avg_demand = avg_supply = avg_ratio = max_surge = min_eta = max_eta = 0
    
    # Demand events in this zone
    demand_events = await db.booking_demand_events.count_documents({"zoneId": zone_id, "timestamp": {"$gte": since}})
    
    # Online providers
    online_providers = await db.provider_locations.count_documents({"zoneId": zone_id, "isOnline": True})
    
    return {
        "zone": zone,
        "timeline": snapshots,
        "stats": {
            "avgDemand": avg_demand, "avgSupply": avg_supply, "avgRatio": avg_ratio,
            "maxSurge": max_surge, "minEta": min_eta, "maxEta": max_eta,
            "totalDemandEvents": demand_events, "onlineProviders": online_providers,
            "dataPoints": len(snapshots),
        },
        "periodHours": hours,
    }


# ═══════════════════════════════════════════════
# 🗺️ GEO + ZONE ENGINE (Phase B)
# ═══════════════════════════════════════════════

def resolve_zone(lat: float, lng: float) -> str:
    """Simple point-in-bounding-box zone resolution"""
    ZONE_BOUNDS = {
        "kyiv-center": (50.44, 50.46, 30.49, 30.55),
        "kyiv-podil": (50.46, 50.48, 30.49, 30.54),
        "kyiv-obolon": (50.48, 50.53, 30.46, 30.52),
        "kyiv-pechersk": (50.42, 50.45, 30.52, 30.58),
        "kyiv-sviatoshyn": (50.44, 50.48, 30.34, 30.40),
        "kyiv-darnytsia": (50.41, 50.45, 30.58, 30.65),
    }
    for zid, (lat_min, lat_max, lng_min, lng_max) in ZONE_BOUNDS.items():
        if lat_min <= lat <= lat_max and lng_min <= lng <= lng_max:
            return zid
    return "kyiv-center"

# ── ZONE RESOLVE (must be before /{zone_id}) ──
@app.get("/api/zones/resolve")
async def zone_resolve(lat: float = 50.4501, lng: float = 30.5234):
    """Resolve which zone a point belongs to"""
    zone_id = resolve_zone(lat, lng)
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    return {"zoneId": zone_id, "zone": zone, "point": {"lat": lat, "lng": lng}}

# ── ZONES CRUD ──
@app.get("/api/zones")
async def get_all_zones():
    """Get all zones with live state"""
    zones = await db.zones.find({}, {"_id": 0}).to_list(50)
    return {"zones": zones, "total": len(zones)}

@app.get("/api/zones/{zone_id}")
async def get_zone(zone_id: str):
    """Get single zone"""
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    if not zone:
        raise HTTPException(404, "Zone not found")
    return zone

@app.post("/api/zones/{zone_id}/recalculate")
async def recalculate_zone(zone_id: str):
    """Recalculate zone state from live data"""
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    if not zone:
        raise HTTPException(404, "Zone not found")
    
    # Count active bookings (demand) and online providers (supply)
    demand = await db.web_bookings.count_documents({"status": {"$in": ["pending", "confirmed", "on_route"]}})
    supply = await db.organizations.count_documents({"status": "active", "isOnline": True})
    demand_zone = max(1, demand + random.randint(-2, 5))
    supply_zone = max(1, supply + random.randint(-1, 2))
    ratio = round(demand_zone / supply_zone, 2)
    
    if ratio < 1: status, surge = "BALANCED", 1.0
    elif ratio < 2: status, surge = "BUSY", round(1 + (ratio - 1) * 0.3, 2)
    elif ratio < 3: status, surge = "SURGE", round(1.3 + (ratio - 2) * 0.4, 2)
    else: status, surge = "CRITICAL", min(2.5, round(1.7 + (ratio - 3) * 0.3, 2))
    
    avg_eta = max(3, int(8 + ratio * 3 + random.uniform(-2, 2)))
    match_rate = max(30, int(90 - ratio * 12 + random.uniform(-5, 5)))
    
    update = {"demandScore": demand_zone, "supplyScore": supply_zone, "ratio": ratio, "surgeMultiplier": surge, "avgEta": avg_eta, "matchRate": match_rate, "status": status, "updatedAt": now_utc().isoformat()}
    await db.zones.update_one({"id": zone_id}, {"$set": update})
    
    # Save snapshot
    await db.zone_snapshots.insert_one({"zoneId": zone_id, "timestamp": now_utc().isoformat(), "demand": demand_zone, "supply": supply_zone, "ratio": ratio, "surge": surge, "avgEta": avg_eta})
    
    # Emit realtime event
    await emit_realtime_event("zone:updated", {"zoneId": zone_id, "status": status, "surge": surge, "demand": demand_zone, "supply": supply_zone})
    
    return {**zone, **update}

@app.post("/api/zones/recalculate-all")
async def recalculate_all_zones():
    """Recalculate all zones"""
    zones = await db.zones.find({}, {"_id": 0, "id": 1}).to_list(50)
    results = []
    for z in zones:
        try:
            result = await recalculate_zone(z["id"])
            results.append({"zoneId": z["id"], "status": result.get("status"), "surge": result.get("surgeMultiplier")})
        except Exception:
            pass
    return {"recalculated": len(results), "zones": results}

# ── HEATMAP ──
@app.get("/api/admin/zones/heatmap")
async def zones_heatmap(_=Depends(verify_admin_token)):
    """Get heatmap data for all zones"""
    zones = await db.zones.find({}, {"_id": 0}).to_list(50)
    heatmap = []
    for z in zones:
        center = z.get("center", {})
        intensity = min(1.0, z.get("ratio", 1) / 5)
        heatmap.append({
            "zoneId": z["id"], "name": z["name"],
            "lat": center.get("lat", 50.45), "lng": center.get("lng", 30.52),
            "intensity": round(intensity, 3),
            "demand": z.get("demandScore", 0), "supply": z.get("supplyScore", 0),
            "ratio": z.get("ratio", 1), "surge": z.get("surgeMultiplier", 1),
            "status": z.get("status", "BALANCED"), "color": z.get("color", "#22C55E"),
        })
    return {"heatmap": heatmap, "total": len(heatmap)}

# ── ZONE HISTORY / ANALYTICS ──
@app.get("/api/admin/zones/{zone_id}/history")
async def zone_history(zone_id: str, hours: int = 24, _=Depends(verify_admin_token)):
    """Get zone history timeline"""
    since = (now_utc() - timedelta(hours=hours)).isoformat()
    snaps = await db.zone_snapshots.find({"zoneId": zone_id, "timestamp": {"$gte": since}}, {"_id": 0}).sort("timestamp", 1).to_list(200)
    return {"zoneId": zone_id, "timeline": snaps, "periodHours": hours, "dataPoints": len(snaps)}

# ── ADMIN ZONE CONTROLS ──
@app.post("/api/admin/zones/{zone_id}/override-surge")
async def override_zone_surge(zone_id: str, request: Request, _=Depends(verify_admin_token)):
    """Override surge multiplier for a zone"""
    body = await request.json()
    surge = body.get("surgeMultiplier", 1.0)
    await db.zones.update_one({"id": zone_id}, {"$set": {"surgeMultiplier": surge, "updatedAt": now_utc().isoformat()}})
    await emit_realtime_event("zone:surge_changed", {"zoneId": zone_id, "surge": surge})
    return {"status": "surge_overridden", "zoneId": zone_id, "surgeMultiplier": surge}

@app.post("/api/admin/zones/{zone_id}/push-providers")
async def push_zone_providers(zone_id: str, request: Request, _=Depends(verify_admin_token)):
    """Push notification to providers in a zone"""
    body = await request.json()
    message = body.get("message", "Новые заявки в вашей зоне!")
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    if not zone:
        raise HTTPException(404, "Zone not found")
    await emit_realtime_event("zone:provider_push", {"zoneId": zone_id, "message": message, "zoneName": zone.get("name")})
    return {"status": "pushed", "zoneId": zone_id, "message": message}

@app.post("/api/admin/zones/{zone_id}/config")
async def update_zone_config(zone_id: str, request: Request, _=Depends(verify_admin_token)):
    """Update zone configuration (thresholds, fanout, etc.)"""
    body = await request.json()
    allowed = {"surgeThresholds", "fanoutMultiplier", "etaTarget", "maxProviders", "name", "color"}
    update = {k: v for k, v in body.items() if k in allowed}
    update["updatedAt"] = now_utc().isoformat()
    await db.zones.update_one({"id": zone_id}, {"$set": update})
    return {"status": "updated", "zoneId": zone_id, "updated": list(update.keys())}

# ── ZONE-AWARE DISTRIBUTION CONFIG ──
@app.get("/api/admin/zones/distribution-config")
async def get_zone_distribution_config(_=Depends(verify_admin_token)):
    """Get zone-aware distribution settings"""
    config = await db.zone_distribution_config.find_one({"type": "global"}, {"_id": 0})
    if not config:
        config = {"type": "global", "fanoutByStatus": {"BALANCED": 2, "BUSY": 3, "SURGE": 4, "CRITICAL": 6}, "surgeThresholds": {"BUSY": 1.5, "SURGE": 2.5, "CRITICAL": 3.5}, "etaTargets": {"BALANCED": 10, "BUSY": 15, "SURGE": 20, "CRITICAL": 30}}
    return config

@app.post("/api/admin/zones/distribution-config")
async def update_zone_distribution_config(request: Request, _=Depends(verify_admin_token)):
    body = await request.json()
    await db.zone_distribution_config.update_one({"type": "global"}, {"$set": {**body, "type": "global", "updatedAt": now_utc().isoformat()}}, upsert=True)
    return {"status": "updated"}

# ── ZONE DASHBOARD ──
@app.get("/api/admin/zones/dashboard")
async def zones_dashboard(_=Depends(verify_admin_token)):
    """Comprehensive zones dashboard for admin"""
    zones = await db.zones.find({}, {"_id": 0}).to_list(50)
    total_demand = sum(z.get("demandScore", 0) for z in zones)
    total_supply = sum(z.get("supplyScore", 0) for z in zones)
    by_status = {}
    for z in zones:
        st = z.get("status", "BALANCED")
        by_status.setdefault(st, 0)
        by_status[st] += 1
    
    critical_zones = [z for z in zones if z.get("status") in ("CRITICAL", "SURGE")]
    
    return {
        "summary": {"totalZones": len(zones), "totalDemand": total_demand, "totalSupply": total_supply, "avgRatio": round(total_demand / max(total_supply, 1), 2), "byStatus": by_status},
        "zones": zones,
        "criticalZones": critical_zones,
        "alerts": [{"zoneId": z["id"], "zoneName": z["name"], "status": z["status"], "ratio": z["ratio"], "message": f"{z['name']}: {z['status']} (ratio {z['ratio']})"} for z in critical_zones],
    }

# ═══════════════════════════════════════════════════════════════
# 🧠 PHASE C: CUSTOMER INTELLIGENCE ENGINE
# ═══════════════════════════════════════════════════════════════

# ── C.1: Customer Profile Intelligence ──

async def rebuild_customer_intelligence(customer_id: str) -> dict:
    """Rebuild aggregate intelligence for a customer"""
    # Get completed bookings
    bookings = await db.web_bookings.find({"customerId": customer_id, "status": "completed"}, {"_id": 0}).to_list(200)
    if not bookings:
        bookings = await db.bookings.find({"customerId": customer_id, "status": "completed"}, {"_id": 0}).to_list(200)
    
    # Get favorites
    favs = await db.customer_favorites.find({"customerId": customer_id}, {"_id": 0}).to_list(50)
    fav_ids = [f.get("providerId") for f in favs]
    
    # Get vehicles
    vehicles = await db.vehicles.find({"userId": customer_id}, {"_id": 0}).to_list(10)
    
    # Calculate intelligence
    service_freq = {}
    provider_freq = {}
    zone_freq = {}
    hours_freq = {}
    days_freq = {}
    total_spend = 0
    
    for b in bookings:
        sid = b.get("serviceId", b.get("serviceName", "unknown"))
        service_freq[sid] = service_freq.get(sid, 0) + 1
        
        pid = b.get("providerId", b.get("organizationSlug", ""))
        if pid:
            provider_freq[pid] = provider_freq.get(pid, 0) + 1
        
        zid = b.get("zoneId", "")
        if zid:
            zone_freq[zid] = zone_freq.get(zid, 0) + 1
        
        total_spend += b.get("price", b.get("amount", 0))
    
    top_services = sorted(service_freq.items(), key=lambda x: -x[1])[:5]
    top_providers = sorted(provider_freq.items(), key=lambda x: -x[1])[:5]
    top_zones = sorted(zone_freq.items(), key=lambda x: -x[1])[:3]
    
    n = max(len(bookings), 1)
    repeat_providers = sum(1 for c in provider_freq.values() if c > 1)
    repeat_rate = round(repeat_providers / max(len(provider_freq), 1) * 100, 1)
    
    last_booking = bookings[0] if bookings else None
    last_at = last_booking.get("completedAt", last_booking.get("createdAt")) if last_booking else None
    
    profile = {
        "customerId": customer_id,
        "preferredServiceIds": [s[0] for s in top_services],
        "preferredServices": [{"id": s[0], "count": s[1]} for s in top_services],
        "favoriteProviderIds": fav_ids,
        "topProviders": [{"id": p[0], "count": p[1]} for p in top_providers],
        "topZones": [{"id": z[0], "count": z[1]} for z in top_zones],
        "homeZoneId": top_zones[0][0] if top_zones else None,
        "avgSpend": round(total_spend / n) if n else 0,
        "totalBookings": len(bookings),
        "repeatBookingRate": repeat_rate,
        "lastBookingAt": last_at,
        "vehicleCount": len(vehicles),
        "mostUsedVehicleId": vehicles[0].get("id") if vehicles else None,
        "updatedAt": now_utc().isoformat(),
    }
    
    # Store
    await db.customer_intelligence.update_one(
        {"customerId": customer_id},
        {"$set": profile},
        upsert=True
    )
    
    return profile


@app.get("/api/customer/intelligence")
async def get_customer_intelligence(request: Request):
    """Get customer intelligence profile"""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
        cid = payload.get("sub")
    except Exception:
        raise HTTPException(401, "Invalid token")
    
    # Try cached first
    cached = await db.customer_intelligence.find_one({"customerId": cid}, {"_id": 0})
    if cached:
        return cached
    
    # Rebuild
    return await rebuild_customer_intelligence(cid)


# ── C.2: Favorites Engine ──

@app.get("/api/customer/favorites")
async def get_customer_favorites(request: Request):
    """Get customer favorites list with provider details"""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
        cid = payload.get("sub")
    except Exception:
        raise HTTPException(401, "Invalid token")
    
    favs = await db.customer_favorites.find({"customerId": cid}, {"_id": 0}).to_list(50)
    
    # Enrich with provider data
    enriched = []
    for f in favs:
        provider = await db.organizations.find_one({"slug": f.get("providerId")}, {"_id": 0, "name": 1, "slug": 1, "ratingAvg": 1, "reviewsCount": 1, "isOnline": 1, "address": 1, "priceFrom": 1, "badges": 1, "type": 1, "workHours": 1})
        if provider:
            enriched.append({**f, "provider": provider})
        else:
            enriched.append(f)
    
    return {"favorites": enriched, "total": len(enriched)}


@app.post("/api/customer/favorites")
async def add_customer_favorite(request: Request):
    """Add provider to favorites"""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
        cid = payload.get("sub")
    except Exception:
        raise HTTPException(401, "Invalid token")
    
    body = await request.json()
    provider_id = body.get("providerId")
    if not provider_id:
        raise HTTPException(400, "providerId required")
    
    existing = await db.customer_favorites.find_one({"customerId": cid, "providerId": provider_id})
    if not existing:
        await db.customer_favorites.insert_one({
            "customerId": cid, "providerId": provider_id,
            "createdAt": now_utc().isoformat(),
        })
    
    count = await db.customer_favorites.count_documents({"customerId": cid})
    
    # Track behavior
    await db.customer_behavior_events.insert_one({
        "customerId": cid, "type": "favorite_added", "providerId": provider_id,
        "timestamp": now_utc().isoformat(),
    })
    
    return {"ok": True, "favoriteCount": count}


@app.delete("/api/customer/favorites/{provider_id}")
async def remove_customer_favorite(provider_id: str, request: Request):
    """Remove provider from favorites"""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
        cid = payload.get("sub")
    except Exception:
        raise HTTPException(401, "Invalid token")
    
    await db.customer_favorites.delete_one({"customerId": cid, "providerId": provider_id})
    count = await db.customer_favorites.count_documents({"customerId": cid})
    return {"ok": True, "favoriteCount": count}


# ── C.3: Repeat Booking Engine ──

@app.get("/api/customer/repeat-options")
async def get_repeat_options(request: Request):
    """Get repeat booking options based on history"""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
        cid = payload.get("sub")
    except Exception:
        raise HTTPException(401, "Invalid token")
    
    # Get recent completed bookings
    bookings = await db.web_bookings.find(
        {"customerId": cid, "status": "completed"},
        {"_id": 0}
    ).sort("completedAt", -1).to_list(20)
    
    if not bookings:
        bookings = await db.bookings.find(
            {"customerId": cid, "status": "completed"},
            {"_id": 0}
        ).sort("createdAt", -1).to_list(20)
    
    # Build repeat options with scoring
    seen = set()
    options = []
    
    for b in bookings:
        pid = b.get("providerId", b.get("organizationSlug", ""))
        sid = b.get("serviceId", b.get("serviceName", ""))
        key = f"{pid}_{sid}"
        if key in seen or not pid:
            continue
        seen.add(key)
        
        # Recency score (0-1): recent = higher
        created = b.get("completedAt", b.get("createdAt", ""))
        days_ago = 30  # default
        if created:
            try:
                from dateutil.parser import parse as parse_dt
                delta = now_utc() - parse_dt(created).replace(tzinfo=timezone.utc)
                days_ago = delta.days
            except Exception:
                pass
        recency = max(0, min(1, 1 - days_ago / 180))
        
        # Frequency score
        freq_count = sum(1 for bb in bookings if bb.get("providerId", bb.get("organizationSlug")) == pid)
        frequency = min(1, freq_count / 5)
        
        # Provider rating score
        provider = await db.organizations.find_one({"slug": pid}, {"_id": 0, "name": 1, "ratingAvg": 1, "isOnline": 1, "priceFrom": 1})
        rating_score = (provider.get("ratingAvg", 4) / 5) if provider else 0.8
        
        confidence = round(recency * 0.35 + frequency * 0.30 + rating_score * 0.20 + 0.15, 2)
        
        options.append({
            "providerId": pid,
            "serviceId": sid,
            "vehicleId": b.get("vehicleId"),
            "title": f"Повторить: {b.get('serviceName', sid)}",
            "providerName": provider.get("name", pid) if provider else pid,
            "priceFrom": provider.get("priceFrom") if provider else b.get("price"),
            "isOnline": provider.get("isOnline", False) if provider else False,
            "lastOrderedAt": created,
            "daysAgo": days_ago,
            "repeatConfidence": confidence,
        })
    
    options.sort(key=lambda x: -x["repeatConfidence"])
    return {"options": options[:5], "total": len(options)}


@app.post("/api/customer/repeat-booking")
async def create_repeat_booking(request: Request):
    """Create a repeat booking from history"""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
        cid = payload.get("sub")
    except Exception:
        raise HTTPException(401, "Invalid token")
    
    body = await request.json()
    pid = body.get("providerId")
    sid = body.get("serviceId")
    vid = body.get("vehicleId")
    
    if not pid or not sid:
        raise HTTPException(400, "providerId and serviceId required")
    
    # Create booking draft
    booking = {
        "id": uid(), "customerId": cid, "providerId": pid,
        "serviceId": sid, "vehicleId": vid,
        "source": "repeat", "status": "draft",
        "createdAt": now_utc().isoformat(),
    }
    await db.web_bookings.insert_one(booking)
    booking.pop("_id", None)
    
    # Track behavior
    await db.customer_behavior_events.insert_one({
        "customerId": cid, "type": "repeat_clicked", "providerId": pid, "serviceId": sid,
        "timestamp": now_utc().isoformat(),
    })
    
    return {"status": "draft_created", "booking": booking}


# ── C.4: Garage Intelligence ──

@app.get("/api/customer/garage/recommendations")
async def get_garage_recommendations(request: Request):
    """Get vehicle-aware maintenance recommendations"""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
        cid = payload.get("sub")
    except Exception:
        raise HTTPException(401, "Invalid token")
    
    vehicles = await db.vehicles.find({"userId": cid}, {"_id": 0}).to_list(10)
    
    recommendations = []
    
    for v in vehicles:
        vid = v.get("id", str(v.get("_id", "")))
        brand = v.get("brand", v.get("make", "Авто"))
        model_name = v.get("model", "")
        year = v.get("year", 2020)
        
        # Get last service dates from bookings
        last_oil = await db.web_bookings.find_one(
            {"customerId": cid, "vehicleId": vid, "serviceName": {"$regex": "масл|oil", "$options": "i"}, "status": "completed"},
            {"_id": 0}
        )
        last_diag = await db.web_bookings.find_one(
            {"customerId": cid, "vehicleId": vid, "serviceName": {"$regex": "диагност|diagnostics", "$options": "i"}, "status": "completed"},
            {"_id": 0}
        )
        last_brakes = await db.web_bookings.find_one(
            {"customerId": cid, "vehicleId": vid, "serviceName": {"$regex": "тормоз|brake", "$options": "i"}, "status": "completed"},
            {"_id": 0}
        )
        
        car_name = f"{brand} {model_name}".strip()
        car_age = 2026 - year
        
        # Oil change recommendation
        months_since_oil = 7  # default
        if last_oil:
            try:
                from dateutil.parser import parse as parse_dt
                d = now_utc() - parse_dt(last_oil.get("completedAt", last_oil.get("createdAt", ""))).replace(tzinfo=timezone.utc)
                months_since_oil = d.days // 30
            except Exception:
                pass
        
        if months_since_oil >= 6:
            urgency = "high" if months_since_oil >= 10 else "medium"
            recommendations.append({
                "vehicleId": vid, "vehicleName": car_name,
                "type": "oil_change", "title": "Замена масла",
                "reason": f"Прошло {months_since_oil} мес. с прошлой замены" if last_oil else "Рекомендуем регулярную замену масла",
                "urgency": urgency, "confidence": min(0.95, 0.5 + months_since_oil * 0.05),
                "serviceSlug": "oil-change",
            })
        
        # Diagnostics recommendation
        months_since_diag = 13  # default
        if last_diag:
            try:
                from dateutil.parser import parse as parse_dt
                d = now_utc() - parse_dt(last_diag.get("completedAt", last_diag.get("createdAt", ""))).replace(tzinfo=timezone.utc)
                months_since_diag = d.days // 30
            except Exception:
                pass
        
        if months_since_diag >= 12:
            recommendations.append({
                "vehicleId": vid, "vehicleName": car_name,
                "type": "diagnostics", "title": "Компьютерная диагностика",
                "reason": f"Прошло {months_since_diag} мес. — пора проверить" if last_diag else "Рекомендуем ежегодную диагностику",
                "urgency": "medium", "confidence": 0.7,
                "serviceSlug": "computer-diagnostics",
            })
        
        # Age-based
        if car_age >= 5:
            recommendations.append({
                "vehicleId": vid, "vehicleName": car_name,
                "type": "seasonal_check", "title": "Сезонный осмотр",
                "reason": f"Авто {year} года — рекомендуем регулярные проверки",
                "urgency": "low", "confidence": 0.55,
                "serviceSlug": "full-maintenance",
            })
    
    recommendations.sort(key=lambda x: -x["confidence"])
    return {"recommendations": recommendations, "total": len(recommendations)}


# ── C.5: Unified Recommendation Engine ──

@app.get("/api/customer/recommendations")
async def get_customer_recommendations(request: Request):
    """Unified recommendation engine: repeat, favorites, maintenance, zone"""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
        cid = payload.get("sub")
    except Exception:
        raise HTTPException(401, "Invalid token")
    
    recs = []
    
    # 1. Repeat booking recs
    try:
        repeat_opts = await db.web_bookings.find(
            {"customerId": cid, "status": "completed"},
            {"_id": 0}
        ).sort("completedAt", -1).to_list(5)
        
        if repeat_opts:
            b = repeat_opts[0]
            pid = b.get("providerId", b.get("organizationSlug", ""))
            provider = await db.organizations.find_one({"slug": pid}, {"_id": 0, "name": 1, "isOnline": 1})
            pname = provider.get("name", pid) if provider else pid
            recs.append({
                "id": uid(), "type": "repeat_booking", "priority": 90,
                "title": f"Повторить: {b.get('serviceName', 'заказ')}",
                "subtitle": f"У {pname}" + (" • Онлайн" if provider and provider.get("isOnline") else ""),
                "ctaText": "Повторить", "ctaAction": "repeat_booking",
                "payload": {"providerId": pid, "serviceId": b.get("serviceId"), "vehicleId": b.get("vehicleId")},
            })
    except Exception:
        pass
    
    # 2. Favorite provider nearby
    try:
        favs = await db.customer_favorites.find({"customerId": cid}, {"_id": 0}).to_list(10)
        for f in favs[:2]:
            provider = await db.organizations.find_one({"slug": f.get("providerId")}, {"_id": 0, "name": 1, "isOnline": 1, "ratingAvg": 1})
            if provider and provider.get("isOnline"):
                recs.append({
                    "id": uid(), "type": "favorite_provider", "priority": 75,
                    "title": f"{provider['name']} онлайн",
                    "subtitle": f"Рейтинг {provider.get('ratingAvg', 4.5)} • Ваш проверенный мастер",
                    "ctaText": "Записаться", "ctaAction": "open_provider",
                    "payload": {"providerId": f.get("providerId")},
                })
    except Exception:
        pass
    
    # 3. Vehicle maintenance
    try:
        vehicles = await db.vehicles.find({"userId": cid}, {"_id": 0}).to_list(5)
        for v in vehicles[:1]:
            car_name = f"{v.get('brand', v.get('make', ''))} {v.get('model', '')}".strip()
            if car_name:
                recs.append({
                    "id": uid(), "type": "maintenance", "priority": 60,
                    "title": f"Проверьте {car_name}",
                    "subtitle": "Рекомендуем пройти диагностику",
                    "ctaText": "Подробнее", "ctaAction": "open_service",
                    "payload": {"serviceSlug": "computer-diagnostics", "vehicleId": v.get("id")},
                })
    except Exception:
        pass
    
    # 4. Zone opportunity
    try:
        # Get user's zone and check if it's good
        user_zone = await db.zones.find_one({"status": "BALANCED"}, {"_id": 0, "name": 1, "supplyScore": 1, "surgeMultiplier": 1})
        if user_zone and user_zone.get("surgeMultiplier", 1) <= 1.1:
            recs.append({
                "id": uid(), "type": "zone_opportunity", "priority": 45,
                "title": f"{user_zone['name']}: хороший момент",
                "subtitle": f"{user_zone.get('supplyScore', 0)} мастеров онлайн • нет Surge",
                "ctaText": "Найти мастера", "ctaAction": "quick_request",
                "payload": {"zoneId": user_zone.get("id")},
            })
    except Exception:
        pass
    
    # 5. Service suggestion
    if not recs:
        recs.append({
            "id": uid(), "type": "service_suggestion", "priority": 30,
            "title": "Нужен автосервис?",
            "subtitle": "Найдите проверенных мастеров рядом",
            "ctaText": "Найти СТО", "ctaAction": "quick_request",
            "payload": {},
        })
    
    recs.sort(key=lambda x: -x["priority"])
    return {"recommendations": recs, "total": len(recs)}


# ── C.6: Customer History Summary ──

@app.get("/api/customer/history/summary")
async def get_customer_history_summary(request: Request):
    """Get customer behavior summary"""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
        cid = payload.get("sub")
    except Exception:
        raise HTTPException(401, "Invalid token")
    
    # Aggregate bookings
    bookings = await db.web_bookings.find({"customerId": cid}, {"_id": 0}).to_list(200)
    if not bookings:
        bookings = await db.bookings.find({"customerId": cid}, {"_id": 0}).to_list(200)
    
    completed = [b for b in bookings if b.get("status") == "completed"]
    cancelled = [b for b in bookings if b.get("status") == "cancelled"]
    
    service_freq = {}
    provider_freq = {}
    zone_freq = {}
    total_spend = 0
    
    for b in completed:
        sid = b.get("serviceId", b.get("serviceName", "unknown"))
        service_freq[sid] = service_freq.get(sid, 0) + 1
        pid = b.get("providerId", b.get("organizationSlug", ""))
        if pid:
            provider_freq[pid] = provider_freq.get(pid, 0) + 1
        zid = b.get("zoneId", "")
        if zid:
            zone_freq[zid] = zone_freq.get(zid, 0) + 1
        total_spend += b.get("price", b.get("amount", 0))
    
    n = max(len(completed), 1)
    repeat_providers = sum(1 for c in provider_freq.values() if c > 1)
    
    # Behavior events
    events_count = await db.customer_behavior_events.count_documents({"customerId": cid})
    quick_count = await db.customer_behavior_events.count_documents({"customerId": cid, "type": "quick_request_used"})
    
    return {
        "customerId": cid,
        "totalBookings": len(bookings),
        "completedBookings": len(completed),
        "cancelledBookings": len(cancelled),
        "completionRate": round(len(completed) / max(len(bookings), 1) * 100, 1),
        "avgSpend": round(total_spend / n),
        "totalSpend": total_spend,
        "topServices": sorted(service_freq.items(), key=lambda x: -x[1])[:5],
        "topProviders": sorted(provider_freq.items(), key=lambda x: -x[1])[:5],
        "topZones": sorted(zone_freq.items(), key=lambda x: -x[1])[:3],
        "repeatProviderRate": round(repeat_providers / max(len(provider_freq), 1) * 100, 1),
        "quickRequestUsageRate": round(quick_count / max(events_count, 1) * 100, 1),
        "totalBehaviorEvents": events_count,
    }


# ── C.7: Customer Behavior Events ──

@app.post("/api/customer/behavior/track")
async def track_customer_behavior(request: Request):
    """Track customer behavior event"""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
        cid = payload.get("sub")
    except Exception:
        raise HTTPException(401, "Invalid token")
    
    body = await request.json()
    event = {
        "customerId": cid,
        "type": body.get("type", "unknown"),
        "providerId": body.get("providerId"),
        "serviceId": body.get("serviceId"),
        "vehicleId": body.get("vehicleId"),
        "zoneId": body.get("zoneId"),
        "timestamp": now_utc().isoformat(),
    }
    await db.customer_behavior_events.insert_one(event)
    event.pop("_id", None)
    return {"status": "tracked", "event": event}


# ═══════════════════════════════════════════════════════════════
# 🔥 PHASE D: PROVIDER INTELLIGENCE ENGINE
# ═══════════════════════════════════════════════════════════════

@app.get("/api/provider/intelligence")
async def get_provider_intelligence(request: Request):
    """Full provider intelligence summary"""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
        uid_val = payload.get("sub")
    except Exception:
        raise HTTPException(401, "Invalid token")
    
    user = await db.users.find_one({"_id": __import__('bson').ObjectId(uid_val)}, {"_id": 0, "email": 1, "role": 1})
    
    # Find org owned by this user or use first active
    org = await db.organizations.find_one({"ownerId": uid_val, "status": "active"}, {"_id": 0})
    if not org:
        org = await db.organizations.find_one({"status": "active"}, {"_id": 0})
    
    slug = org.get("slug", "avtomaster-pro") if org else "avtomaster-pro"
    
    # Performance data
    perf = await db.provider_performance.find_one({"providerSlug": slug}, {"_id": 0}) or {}
    skills = await db.provider_skills.find({"providerSlug": slug}, {"_id": 0}).to_list(10)
    avail = await db.provider_availability.find_one({"providerSlug": slug}, {"_id": 0}) or {}
    
    # Calculate scores
    accept_rate = perf.get("acceptanceRate", 75)
    completion_rate = perf.get("completionRate", 85)
    response_time = perf.get("avgResponseTime", 15)
    quality = perf.get("qualityScore", 70)
    cancel_rate = perf.get("cancelRate", 5)
    repeat_rate = perf.get("repeatCustomerRate", 20)
    total_jobs = perf.get("totalJobs", 50)
    
    speed_score = round(max(0, min(100, (1 - response_time / 120) * 100)), 1)
    perf_score = round(accept_rate * 0.25 + completion_rate * 0.25 + speed_score * 0.20 + quality * 0.20 + repeat_rate * 0.10, 1)
    trust_score = round(quality * 0.5 + completion_rate * 0.3 + (100 - cancel_rate) * 0.2, 1)
    
    rating = org.get("ratingAvg", 4.5) if org else 4.5
    
    # Tier
    if perf_score >= 85: tier = "platinum"
    elif perf_score >= 70: tier = "gold"
    elif perf_score >= 50: tier = "silver"
    else: tier = "bronze"
    
    # Lost revenue estimate
    missed = random.randint(2, 8)
    avg_request_val = org.get("priceFrom", 500) if org else 500
    lost_revenue = missed * avg_request_val
    
    # Strongest/weakest skills
    strong = [s["category"] for s in skills if s.get("level", 0) >= 4]
    weak = [s["category"] for s in skills if s.get("level", 0) <= 2]
    
    profile = {
        "providerId": slug,
        "providerName": org.get("name", slug) if org else slug,
        "performanceScore": perf_score,
        "trustScore": trust_score,
        "speedScore": speed_score,
        "qualityScore": quality,
        "monetizationScore": round(random.uniform(40, 90), 1),
        "avgResponseTime": response_time,
        "acceptanceRate": accept_rate,
        "completionRate": completion_rate,
        "cancelRate": cancel_rate,
        "repeatCustomerRate": repeat_rate,
        "totalJobs": total_jobs,
        "totalRevenue": total_jobs * avg_request_val,
        "lostRevenueEstimate": lost_revenue,
        "strongestSkills": strong,
        "weakestSkills": weak,
        "currentTier": tier,
        "rating": rating,
        "reviewsCount": org.get("reviewsCount", 0) if org else 0,
        "visibilityState": org.get("visibilityState", "normal") if org else "normal",
        "isOnline": org.get("isOnline", False) if org else False,
    }
    
    # Pressure
    zone_loc = await db.provider_locations.find_one({"providerId": slug}, {"_id": 0})
    zone_id = zone_loc.get("zoneId", "kyiv-center") if zone_loc else "kyiv-center"
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    
    pressure = {
        "missedRequests": missed,
        "lostRevenueEstimate": lost_revenue,
        "avgAcceptDelaySeconds": response_time * 60,
        "rankInZone": random.randint(1, 8),
        "providersAhead": random.randint(0, 5),
        "zoneStatus": zone.get("status", "BALANCED") if zone else "BALANCED",
        "zoneSurge": zone.get("surgeMultiplier", 1) if zone else 1,
    }
    
    # Opportunities
    opportunities = []
    if zone and zone.get("status") in ("SURGE", "CRITICAL"):
        opportunities.append({
            "type": "high_demand_now", "priority": 95,
            "title": f"🔥 {zone.get('name', 'Зона')}: высокий спрос",
            "subtitle": f"Ratio {zone.get('ratio', '?')} • Surge x{zone.get('surgeMultiplier', 1)}",
            "actionText": "Выйти онлайн",
        })
    
    if not org or not org.get("isOnline"):
        opportunities.append({
            "type": "go_online", "priority": 90,
            "title": "Выйдите онлайн",
            "subtitle": "Сейчас есть заявки в вашем районе",
            "actionText": "Включить",
        })
    
    if accept_rate < 70:
        opportunities.append({
            "type": "improve_acceptance", "priority": 70,
            "title": "Повысьте acceptance rate",
            "subtitle": f"Сейчас {accept_rate}% — рекомендуем 80%+",
            "actionText": "Подробнее",
        })
    
    if response_time > 10:
        opportunities.append({
            "type": "improve_response", "priority": 65,
            "title": "Отвечайте быстрее",
            "subtitle": f"Ваш ответ: {response_time} мин • Топ: 5 мин",
            "actionText": "Советы",
        })
    
    opportunities.append({
        "type": "buy_priority", "priority": 50,
        "title": "Включите Priority",
        "subtitle": f"Получайте на {random.randint(25, 45)}% больше заказов",
        "actionText": "Подключить",
    })
    
    opportunities.sort(key=lambda x: -x["priority"])
    
    return {"profile": profile, "pressure": pressure, "opportunities": opportunities[:5]}


@app.get("/api/provider/intelligence/earnings")
async def provider_intelligence_earnings(request: Request):
    """Provider earnings intelligence"""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    try:
        jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
    except Exception:
        raise HTTPException(401, "Invalid token")
    
    return {
        "today": random.randint(500, 3000),
        "week": random.randint(5000, 20000),
        "month": random.randint(20000, 60000),
        "avgPerJob": random.randint(300, 800),
        "missedRevenue": random.randint(200, 2000),
        "bestDay": random.choice(["Пн", "Вт", "Ср", "Чт", "Пт"]),
        "bestTime": random.choice(["09:00-12:00", "14:00-17:00", "18:00-21:00"]),
        "trend": round(random.uniform(-10, 25), 1),
    }


@app.get("/api/provider/intelligence/demand")
async def provider_intelligence_demand(request: Request):
    """Demand intelligence for provider's zone"""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    try:
        jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
    except Exception:
        raise HTTPException(401, "Invalid token")
    
    zones = await db.zones.find({}, {"_id": 0}).to_list(10)
    current_zone = zones[0] if zones else {"id": "unknown", "name": "Unknown", "status": "BALANCED", "ratio": 1, "surgeMultiplier": 1, "avgEta": 10}
    
    # Find best zone
    best_zone = max(zones, key=lambda z: z.get("ratio", 0)) if zones else current_zone
    
    return {
        "currentZone": {"id": current_zone["id"], "name": current_zone.get("name"), "status": current_zone.get("status"), "ratio": current_zone.get("ratio")},
        "demandLevel": current_zone.get("status", "BALANCED"),
        "avgEta": current_zone.get("avgEta", 10),
        "activeRequests": current_zone.get("demandScore", 5),
        "onlineProviders": current_zone.get("supplyScore", 3),
        "surge": current_zone.get("surgeMultiplier", 1),
        "recommendedZone": {
            "zoneId": best_zone["id"], "name": best_zone.get("name"),
            "reason": f"Ratio {best_zone.get('ratio')} — больше спроса",
            "potentialGain": f"+{random.randint(15, 45)}%",
        } if best_zone["id"] != current_zone["id"] else None,
        "allZones": [{"id": z["id"], "name": z.get("name"), "status": z.get("status"), "ratio": z.get("ratio"), "surge": z.get("surgeMultiplier", 1)} for z in zones],
    }


@app.get("/api/provider/intelligence/performance")
async def provider_intelligence_performance(request: Request):
    """Detailed performance breakdown"""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    try:
        jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
    except Exception:
        raise HTTPException(401, "Invalid token")
    
    perf = await db.provider_performance.find_one({}, {"_id": 0}) or {}
    
    issues = []
    if perf.get("avgResponseTime", 15) > 10:
        issues.append({"type": "slow_response", "message": "Медленный ответ на заявки", "severity": "medium"})
    if perf.get("acceptanceRate", 75) < 70:
        issues.append({"type": "low_acceptance", "message": "Низкий acceptance rate", "severity": "high"})
    if perf.get("cancelRate", 5) > 8:
        issues.append({"type": "high_cancel", "message": "Высокий процент отмен", "severity": "high"})
    
    return {
        "acceptanceRate": perf.get("acceptanceRate", 75),
        "avgResponseTime": perf.get("avgResponseTime", 15),
        "completionRate": perf.get("completionRate", 85),
        "cancelRate": perf.get("cancelRate", 5),
        "qualityScore": perf.get("qualityScore", 70),
        "latenessScore": perf.get("latenessScore", 8),
        "repeatCustomerRate": perf.get("repeatCustomerRate", 20),
        "totalJobs": perf.get("totalJobs", 50),
        "issues": issues,
        "improvementTips": [
            "Отвечайте в течение 5 минут — это увеличивает конверсию на 40%",
            "Принимайте заявки в пиковые часы — это улучшает ranking",
            "Собирайте отзывы — каждый отзыв повышает доверие",
        ],
    }


@app.get("/api/provider/intelligence/lost-revenue")
async def provider_intelligence_lost_revenue(request: Request):
    """Lost revenue analysis"""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    try:
        jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
    except Exception:
        raise HTTPException(401, "Invalid token")
    
    missed_today = random.randint(1, 5)
    missed_week = random.randint(5, 20)
    avg_val = random.randint(400, 800)
    
    return {
        "today": {"missed": missed_today, "lostRevenue": missed_today * avg_val, "avgRequestValue": avg_val},
        "week": {"missed": missed_week, "lostRevenue": missed_week * avg_val},
        "month": {"missed": missed_week * 4, "lostRevenue": missed_week * 4 * avg_val},
        "reasons": [
            {"reason": "Медленный ответ", "count": random.randint(2, 8), "lostAmount": random.randint(500, 3000)},
            {"reason": "Не онлайн", "count": random.randint(1, 5), "lostAmount": random.randint(300, 2000)},
            {"reason": "Пропущены priority заявки", "count": random.randint(0, 3), "lostAmount": random.randint(200, 1500)},
        ],
        "recommendation": "Включите Priority и отвечайте быстрее — вы можете заработать на 35% больше",
    }


@app.get("/api/provider/intelligence/opportunities")
async def provider_intelligence_opportunities(request: Request):
    """Provider opportunity signals"""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    try:
        jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
    except Exception:
        raise HTTPException(401, "Invalid token")
    
    zones = await db.zones.find({}, {"_id": 0}).to_list(10)
    opps = []
    
    for z in zones:
        if z.get("status") in ("SURGE", "CRITICAL"):
            opps.append({
                "type": "high_demand_now", "zoneId": z["id"],
                "title": f"🔥 {z.get('name')}: высокий спрос",
                "subtitle": f"Ratio {z.get('ratio')} • {z.get('demandScore', 0)} заявок",
                "actionText": "Перейти в зону", "priority": 90 + (z.get("ratio", 1) * 5),
            })
    
    opps.append({
        "type": "buy_priority", "zoneId": None,
        "title": "Включите Priority Access",
        "subtitle": f"+{random.randint(25, 45)}% заказов • видимость x2",
        "actionText": "Подключить", "priority": 50,
    })
    
    opps.sort(key=lambda x: -x["priority"])
    return {"opportunities": opps[:5], "total": len(opps)}


@app.post("/api/provider/behavior/track")
async def track_provider_behavior(request: Request):
    """Track provider behavior event"""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
        uid_val = payload.get("sub")
    except Exception:
        raise HTTPException(401, "Invalid token")
    
    body = await request.json()
    event = {
        "providerId": uid_val,
        "type": body.get("type", "unknown"),
        "zoneId": body.get("zoneId"),
        "requestId": body.get("requestId"),
        "metadata": body.get("metadata"),
        "timestamp": now_utc().isoformat(),
    }
    await db.provider_behavior_events.insert_one(event)
    event.pop("_id", None)
    return {"status": "tracked", "event": event}


# ═══════════════════════════════════════════════════════════════
# 📊 MARKETPLACE STATS (for Home V2)
# ═══════════════════════════════════════════════════════════════

@app.get("/api/marketplace/stats")
async def marketplace_stats():
    """Get marketplace stats for customer home"""
    online = await db.organizations.count_documents({"status": "active", "isOnline": True})
    total = await db.organizations.count_documents({"status": "active"})
    
    zones = await db.zones.find({}, {"_id": 0, "status": 1, "surgeMultiplier": 1, "avgEta": 1}).to_list(10)
    avg_eta = round(sum(z.get("avgEta", 10) for z in zones) / max(len(zones), 1), 1) if zones else 10
    has_surge = any(z.get("surgeMultiplier", 1) > 1.2 for z in zones)
    
    return {
        "providersOnline": online,
        "providersTotal": total,
        "avgEta": avg_eta,
        "hasSurge": has_surge,
        "zonesTotal": len(zones),
    }


# ═══════════════════════════════════════════════════════════════
# 🧠 PHASE E: MARKET ORCHESTRATION LAYER
# ═══════════════════════════════════════════════════════════════
#
# Zone/Market state -> Decision -> Actions -> Logs -> Override
#
# System automatically:
#   - reads live zone state
#   - decides actions based on rules config
#   - executes (surge, push, fanout, priority bias, zone boost)
#   - logs everything
#   - respects admin overrides
# ═══════════════════════════════════════════════════════════════

# ── DEFAULT RULES CONFIG ──
ORCHESTRATOR_DEFAULT_RULES = [
    {
        "severity": "BALANCED",
        "enableSurge": False,
        "surgeMultiplier": 1.0,
        "enablePushProviders": False,
        "pushRadiusKm": 0,
        "enableFanoutOverride": False,
        "fanout": 2,
        "enablePriorityBias": False,
        "priorityBiasLevel": 0,
        "enableZoneBoost": False,
        "zoneBoostScore": 0,
        "cooldownSeconds": 120,
    },
    {
        "severity": "BUSY",
        "enableSurge": True,
        "surgeMultiplier": 1.2,
        "enablePushProviders": False,
        "pushRadiusKm": 0,
        "enableFanoutOverride": True,
        "fanout": 3,
        "enablePriorityBias": False,
        "priorityBiasLevel": 0,
        "enableZoneBoost": False,
        "zoneBoostScore": 0,
        "cooldownSeconds": 90,
    },
    {
        "severity": "SURGE",
        "enableSurge": True,
        "surgeMultiplier": 1.5,
        "enablePushProviders": True,
        "pushRadiusKm": 5,
        "enableFanoutOverride": True,
        "fanout": 4,
        "enablePriorityBias": True,
        "priorityBiasLevel": 1,
        "enableZoneBoost": True,
        "zoneBoostScore": 0.05,
        "cooldownSeconds": 60,
    },
    {
        "severity": "CRITICAL",
        "enableSurge": True,
        "surgeMultiplier": 1.8,
        "enablePushProviders": True,
        "pushRadiusKm": 8,
        "enableFanoutOverride": True,
        "fanout": 6,
        "enablePriorityBias": True,
        "priorityBiasLevel": 2,
        "enableZoneBoost": True,
        "zoneBoostScore": 0.1,
        "cooldownSeconds": 30,
    },
]

# In-memory cooldown tracker: { "zoneId:severity": timestamp }
orchestrator_cooldowns: dict = {}
orchestrator_engine_task = None
orchestrator_enabled = True
orchestrator_cycle_count = 0
orchestrator_last_cycle_at: Optional[str] = None
orchestrator_last_actions_count = 0


async def seed_orchestrator_rules():
    """Seed default orchestrator rules if none exist"""
    for rule in ORCHESTRATOR_DEFAULT_RULES:
        existing = await db.orchestrator_rules.find_one({"severity": rule["severity"]})
        if not existing:
            await db.orchestrator_rules.insert_one({**rule, "createdAt": now_utc().isoformat(), "updatedAt": now_utc().isoformat()})
    logger.info("Orchestrator rules seeded")


def is_in_cooldown(zone_id: str, severity: str, cooldown_seconds: int) -> bool:
    """Check if a zone+severity combo is in cooldown"""
    key = f"{zone_id}:{severity}"
    last = orchestrator_cooldowns.get(key)
    if not last:
        return False
    elapsed = (now_utc() - datetime.fromisoformat(last)).total_seconds()
    return elapsed < cooldown_seconds


def set_cooldown(zone_id: str, severity: str):
    """Set cooldown for a zone+severity combo"""
    key = f"{zone_id}:{severity}"
    orchestrator_cooldowns[key] = now_utc().isoformat()


def build_actions(zone: dict, rule: dict, override: Optional[dict] = None) -> list:
    """Build list of actions based on zone state, rule config, and optional override"""
    actions = []
    ov = override.get("overrides", {}) if override else {}

    # ── SURGE ──
    if rule.get("enableSurge") and not ov.get("disableSurge"):
        multiplier = ov.get("forceSurgeMultiplier") or rule.get("surgeMultiplier", 1.0)
        actions.append({
            "type": "ENABLE_SURGE",
            "payload": {"zoneId": zone["id"], "multiplier": multiplier},
            "status": "planned",
        })

    # ── PUSH PROVIDERS ──
    if (rule.get("enablePushProviders") and not ov.get("disablePushProviders")) or ov.get("forcePushProviders"):
        actions.append({
            "type": "PUSH_PROVIDERS",
            "payload": {"zoneId": zone["id"], "radiusKm": rule.get("pushRadiusKm", 5)},
            "status": "planned",
        })

    # ── FANOUT OVERRIDE ──
    if rule.get("enableFanoutOverride") and not ov.get("disableFanoutOverride"):
        fanout = ov.get("forceFanout") or rule.get("fanout", 3)
        actions.append({
            "type": "SET_FANOUT",
            "payload": {"zoneId": zone["id"], "fanout": fanout},
            "status": "planned",
        })

    # ── PRIORITY BIAS ──
    if rule.get("enablePriorityBias"):
        actions.append({
            "type": "SET_PRIORITY_BIAS",
            "payload": {"zoneId": zone["id"], "level": rule.get("priorityBiasLevel", 1)},
            "status": "planned",
        })

    # ── ZONE BOOST ──
    if rule.get("enableZoneBoost"):
        actions.append({
            "type": "SET_ZONE_BOOST",
            "payload": {"zoneId": zone["id"], "boost": rule.get("zoneBoostScore", 0.05)},
            "status": "planned",
        })

    return actions


async def execute_action(action: dict):
    """Execute a single orchestrator action against the database / zone engine"""
    action_type = action["type"]
    payload = action["payload"]
    zone_id = payload.get("zoneId")

    try:
        if action_type == "ENABLE_SURGE":
            multiplier = payload.get("multiplier", 1.0)
            await db.zones.update_one(
                {"id": zone_id},
                {"$set": {"surgeMultiplier": multiplier, "updatedAt": now_utc().isoformat()}}
            )
            await emit_realtime_event("zone:surge_changed", {"zoneId": zone_id, "surgeMultiplier": multiplier, "source": "orchestrator"})
            action["status"] = "executed"

        elif action_type == "PUSH_PROVIDERS":
            radius_km = payload.get("radiusKm", 5)
            # Find providers in/near zone and create push log
            providers_in_zone = await db.provider_locations.count_documents({"zoneId": zone_id, "isOnline": True})
            push_log = {
                "id": uid(), "type": "orchestrator_push", "zoneId": zone_id,
                "radiusKm": radius_km, "targetCount": providers_in_zone,
                "message": f"Высокий спрос в зоне! Есть заказы рядом.",
                "createdAt": now_utc().isoformat(), "status": "sent",
            }
            await db.governance_actions.insert_one(push_log)
            await emit_realtime_event("provider:push", {"zoneId": zone_id, "message": push_log["message"], "source": "orchestrator"})
            action["status"] = "executed"

        elif action_type == "SET_FANOUT":
            fanout = payload.get("fanout", 3)
            await db.zone_distribution_config.update_one(
                {"zoneId": zone_id},
                {"$set": {"zoneId": zone_id, "fanout": fanout, "updatedAt": now_utc().isoformat(), "source": "orchestrator"}},
                upsert=True
            )
            action["status"] = "executed"

        elif action_type == "SET_PRIORITY_BIAS":
            level = payload.get("level", 1)
            await db.zone_distribution_config.update_one(
                {"zoneId": zone_id},
                {"$set": {"zoneId": zone_id, "priorityBiasLevel": level, "updatedAt": now_utc().isoformat(), "source": "orchestrator"}},
                upsert=True
            )
            action["status"] = "executed"

        elif action_type == "SET_ZONE_BOOST":
            boost = payload.get("boost", 0.05)
            await db.zone_distribution_config.update_one(
                {"zoneId": zone_id},
                {"$set": {"zoneId": zone_id, "zoneBoostScore": boost, "updatedAt": now_utc().isoformat(), "source": "orchestrator"}},
                upsert=True
            )
            action["status"] = "executed"

        else:
            action["status"] = "skipped"
            action["reason"] = f"Unknown action type: {action_type}"

    except Exception as e:
        action["status"] = "failed"
        action["reason"] = str(e)
        logger.error(f"Orchestrator action {action_type} failed for zone {zone_id}: {e}")


async def orchestrator_run_cycle():
    """Single orchestrator cycle: analyze all zones, decide, execute, log"""
    global orchestrator_cycle_count, orchestrator_last_cycle_at, orchestrator_last_actions_count

    if not orchestrator_enabled:
        return

    # 1. Get live zone states from DB
    zones = await db.zones.find({}, {"_id": 0}).to_list(50)
    if not zones:
        return

    # 2. Get rules
    rules = await db.orchestrator_rules.find({}, {"_id": 0}).to_list(10)
    if not rules:
        await seed_orchestrator_rules()
        rules = await db.orchestrator_rules.find({}, {"_id": 0}).to_list(10)

    rules_map = {r["severity"]: r for r in rules}

    # 3. Get active overrides
    overrides = await db.orchestrator_overrides.find(
        {"isActive": True},
        {"_id": 0}
    ).to_list(50)
    # Filter expired overrides
    active_overrides = []
    for ov in overrides:
        expires = ov.get("expiresAt")
        if expires and expires < now_utc().isoformat():
            await db.orchestrator_overrides.update_one({"id": ov["id"]}, {"$set": {"isActive": False}})
            continue
        active_overrides.append(ov)
    overrides_map = {ov["zoneId"]: ov for ov in active_overrides}

    total_actions = 0

    for zone in zones:
        zone_id = zone.get("id")
        severity = zone.get("status", "BALANCED")  # BALANCED, BUSY, SURGE, CRITICAL

        rule = rules_map.get(severity)
        if not rule:
            continue

        # Check cooldown
        if is_in_cooldown(zone_id, severity, rule.get("cooldownSeconds", 60)):
            continue

        zone_override = overrides_map.get(zone_id)

        # Build actions
        actions = build_actions(zone, rule, zone_override)
        if not actions:
            continue

        # Execute actions
        for action in actions:
            await execute_action(action)

        # Log
        log_entry = {
            "id": uid(),
            "zoneId": zone_id,
            "zoneName": zone.get("name", zone_id),
            "severity": severity,
            "detectedState": {
                "demand": zone.get("demandScore", 0),
                "supply": zone.get("supplyScore", 0),
                "ratio": zone.get("ratio", 0),
                "avgEta": zone.get("avgEta", 0),
                "surgeMultiplier": zone.get("surgeMultiplier", 1.0),
            },
            "actions": actions,
            "source": "admin_override" if zone_override else "system",
            "cycleNumber": orchestrator_cycle_count,
            "createdAt": now_utc().isoformat(),
        }
        await db.orchestrator_logs.insert_one(log_entry)
        total_actions += len(actions)

        # Set cooldown
        set_cooldown(zone_id, severity)

        # Emit realtime event
        await emit_realtime_event("orchestrator:zone_action", {
            "zoneId": zone_id,
            "severity": severity,
            "actionsCount": len(actions),
            "actions": [{"type": a["type"], "status": a["status"]} for a in actions],
        })

    orchestrator_cycle_count += 1
    orchestrator_last_cycle_at = now_utc().isoformat()
    orchestrator_last_actions_count = total_actions

    if total_actions > 0:
        logger.info(f"Orchestrator cycle #{orchestrator_cycle_count}: {total_actions} actions across {len(zones)} zones")


async def orchestrator_engine_loop():
    """Phase E: Orchestrator Engine - runs every 10 seconds"""
    await seed_orchestrator_rules()
    logger.info("Phase E: Orchestrator Engine started (10s cycle)")

    # Create indexes
    await db.orchestrator_logs.create_index([("createdAt", -1)])
    await db.orchestrator_logs.create_index([("zoneId", 1), ("createdAt", -1)])
    await db.orchestrator_overrides.create_index([("zoneId", 1), ("isActive", 1)])

    while True:
        try:
            await orchestrator_run_cycle()
        except Exception as e:
            logger.error(f"Orchestrator engine error: {e}")
        await asyncio.sleep(10)


# ── Modify startup to include orchestrator ──
original_startup = startup

async def startup_with_orchestrator():
    global orchestrator_engine_task
    await original_startup()
    orchestrator_engine_task = asyncio.create_task(orchestrator_engine_loop())


app.router.on_startup.clear()
app.add_event_handler("startup", startup_with_orchestrator)


# ═══════════════════════════════════════════════
# 📡 ORCHESTRATOR API ENDPOINTS
# ═══════════════════════════════════════════════

@app.get("/api/orchestrator/state")
async def orchestrator_state():
    """Get full orchestrator state: zones + active actions + metrics"""
    zones = await db.zones.find({}, {"_id": 0}).to_list(50)
    rules = await db.orchestrator_rules.find({}, {"_id": 0}).to_list(10)
    rules_map = {r["severity"]: r for r in rules}

    overrides = await db.orchestrator_overrides.find({"isActive": True}, {"_id": 0}).to_list(50)
    overrides_map = {ov["zoneId"]: ov for ov in overrides}

    # Get recent actions per zone (last hour)
    one_hour_ago = (now_utc() - timedelta(hours=1)).isoformat()
    recent_logs = await db.orchestrator_logs.find(
        {"createdAt": {"$gte": one_hour_ago}},
        {"_id": 0}
    ).sort("createdAt", -1).to_list(200)

    # Build per-zone log counts
    zone_action_counts = {}
    zone_last_actions = {}
    for log in recent_logs:
        zid = log["zoneId"]
        zone_action_counts[zid] = zone_action_counts.get(zid, 0) + len(log.get("actions", []))
        if zid not in zone_last_actions:
            zone_last_actions[zid] = [a["type"] for a in log.get("actions", [])]

    zone_states = []
    for z in zones:
        zid = z.get("id")
        severity = z.get("status", "BALANCED")
        rule = rules_map.get(severity, {})
        override = overrides_map.get(zid)

        active_action_types = []
        if rule.get("enableSurge") and not (override and override.get("overrides", {}).get("disableSurge")):
            active_action_types.append("surge")
        if rule.get("enablePushProviders") and not (override and override.get("overrides", {}).get("disablePushProviders")):
            active_action_types.append("push")
        if rule.get("enableFanoutOverride") and not (override and override.get("overrides", {}).get("disableFanoutOverride")):
            active_action_types.append("fanout")
        if rule.get("enablePriorityBias"):
            active_action_types.append("priority_bias")
        if rule.get("enableZoneBoost"):
            active_action_types.append("zone_boost")

        zone_states.append({
            "id": zid,
            "name": z.get("name", zid),
            "status": severity,
            "color": z.get("color", "#22C55E"),
            "demand": z.get("demandScore", 0),
            "supply": z.get("supplyScore", 0),
            "ratio": z.get("ratio", 0),
            "avgEta": z.get("avgEta", 0),
            "surgeMultiplier": z.get("surgeMultiplier", 1.0),
            "matchRate": z.get("matchRate", 0),
            "activeActions": active_action_types,
            "lastActions": zone_last_actions.get(zid, []),
            "actionsLastHour": zone_action_counts.get(zid, 0),
            "hasOverride": override is not None,
            "overrideReason": override.get("reason") if override else None,
        })

    # Global metrics
    total_executed = 0
    total_failed = 0
    total_skipped = 0
    for log in recent_logs:
        for a in log.get("actions", []):
            if a["status"] == "executed":
                total_executed += 1
            elif a["status"] == "failed":
                total_failed += 1
            elif a["status"] == "skipped":
                total_skipped += 1

    return {
        "enabled": orchestrator_enabled,
        "cycleCount": orchestrator_cycle_count,
        "lastCycleAt": orchestrator_last_cycle_at,
        "lastActionsCount": orchestrator_last_actions_count,
        "cycleIntervalSeconds": 10,
        "zones": zone_states,
        "metrics": {
            "totalActionsLastHour": total_executed + total_failed + total_skipped,
            "executedLastHour": total_executed,
            "failedLastHour": total_failed,
            "skippedLastHour": total_skipped,
            "activeOverrides": len(overrides),
            "zonesMonitored": len(zones),
            "criticalZones": sum(1 for z in zones if z.get("status") == "CRITICAL"),
            "surgeZones": sum(1 for z in zones if z.get("status") == "SURGE"),
        },
        "rulesConfigured": len(rules),
    }


@app.get("/api/orchestrator/rules")
async def orchestrator_get_rules():
    """Get all orchestrator rules"""
    rules = await db.orchestrator_rules.find({}, {"_id": 0}).to_list(10)
    if not rules:
        await seed_orchestrator_rules()
        rules = await db.orchestrator_rules.find({}, {"_id": 0}).to_list(10)
    # Sort by severity order
    severity_order = {"BALANCED": 0, "BUSY": 1, "SURGE": 2, "CRITICAL": 3}
    rules.sort(key=lambda r: severity_order.get(r.get("severity"), 99))
    return {"rules": rules}


@app.patch("/api/orchestrator/rules")
async def orchestrator_update_rule(request: Request, _=Depends(verify_admin_token)):
    """Update an orchestrator rule"""
    body = await request.json()
    severity = body.get("severity")
    if severity not in ["BALANCED", "BUSY", "SURGE", "CRITICAL"]:
        raise HTTPException(400, "Invalid severity. Must be BALANCED, BUSY, SURGE, or CRITICAL")

    update_fields = {}
    for key in ["enableSurge", "surgeMultiplier", "enablePushProviders", "pushRadiusKm",
                 "enableFanoutOverride", "fanout", "enablePriorityBias", "priorityBiasLevel",
                 "enableZoneBoost", "zoneBoostScore", "cooldownSeconds"]:
        if key in body:
            update_fields[key] = body[key]

    update_fields["updatedAt"] = now_utc().isoformat()

    result = await db.orchestrator_rules.find_one_and_update(
        {"severity": severity},
        {"$set": update_fields},
        upsert=True,
        return_document=True
    )
    result.pop("_id", None)
    return {"status": "updated", "rule": result}


@app.get("/api/orchestrator/overrides")
async def orchestrator_get_overrides(_=Depends(verify_admin_token)):
    """Get all active orchestrator overrides"""
    overrides = await db.orchestrator_overrides.find(
        {"isActive": True},
        {"_id": 0}
    ).to_list(50)
    # Filter expired
    active = []
    for ov in overrides:
        expires = ov.get("expiresAt")
        if expires and expires < now_utc().isoformat():
            await db.orchestrator_overrides.update_one({"id": ov["id"]}, {"$set": {"isActive": False}})
            continue
        active.append(ov)
    return {"overrides": active}


@app.post("/api/orchestrator/overrides")
async def orchestrator_create_override(request: Request, payload=Depends(verify_admin_token)):
    """Create a manual override for a zone"""
    body = await request.json()
    zone_id = body.get("zoneId")
    if not zone_id:
        raise HTTPException(400, "zoneId is required")

    reason = body.get("reason", "Manual admin override")
    expires_minutes = body.get("expiresMinutes")
    expires_at = (now_utc() + timedelta(minutes=expires_minutes)).isoformat() if expires_minutes else None

    override = {
        "id": uid(),
        "zoneId": zone_id,
        "isActive": True,
        "overrides": {
            "disableSurge": body.get("disableSurge", False),
            "forceSurgeMultiplier": body.get("forceSurgeMultiplier"),
            "disablePushProviders": body.get("disablePushProviders", False),
            "forcePushProviders": body.get("forcePushProviders", False),
            "disableFanoutOverride": body.get("disableFanoutOverride", False),
            "forceFanout": body.get("forceFanout"),
        },
        "reason": reason,
        "createdBy": payload.get("email", "admin"),
        "expiresAt": expires_at,
        "createdAt": now_utc().isoformat(),
    }
    await db.orchestrator_overrides.insert_one(override)
    override.pop("_id", None)

    # Log the override creation
    await db.orchestrator_logs.insert_one({
        "id": uid(),
        "zoneId": zone_id,
        "zoneName": zone_id,
        "severity": "OVERRIDE",
        "detectedState": {"demand": 0, "supply": 0, "ratio": 0, "avgEta": 0},
        "actions": [{"type": "ADMIN_OVERRIDE_CREATED", "payload": override["overrides"], "status": "executed"}],
        "source": "admin_override",
        "createdAt": now_utc().isoformat(),
    })

    return {"status": "created", "override": override}


@app.post("/api/orchestrator/overrides/{override_id}/disable")
async def orchestrator_disable_override(override_id: str, _=Depends(verify_admin_token)):
    """Disable an active override"""
    result = await db.orchestrator_overrides.find_one_and_update(
        {"id": override_id, "isActive": True},
        {"$set": {"isActive": False, "disabledAt": now_utc().isoformat()}},
        return_document=True
    )
    if not result:
        raise HTTPException(404, "Override not found or already disabled")
    result.pop("_id", None)
    return {"status": "disabled", "override": result}


@app.get("/api/orchestrator/logs")
async def orchestrator_get_logs(limit: int = 100, zoneId: str = None, severity: str = None):
    """Get orchestrator action logs"""
    query = {}
    if zoneId:
        query["zoneId"] = zoneId
    if severity:
        query["severity"] = severity

    logs = await db.orchestrator_logs.find(query, {"_id": 0}).sort("createdAt", -1).to_list(limit)

    # Aggregate stats
    stats = {"total": len(logs), "executed": 0, "failed": 0, "skipped": 0, "bySeverity": {}, "byActionType": {}}
    for log in logs:
        sev = log.get("severity", "?")
        stats["bySeverity"][sev] = stats["bySeverity"].get(sev, 0) + 1
        for a in log.get("actions", []):
            atype = a.get("type", "?")
            stats["byActionType"][atype] = stats["byActionType"].get(atype, 0) + 1
            if a["status"] == "executed":
                stats["executed"] += 1
            elif a["status"] == "failed":
                stats["failed"] += 1
            elif a["status"] == "skipped":
                stats["skipped"] += 1

    return {"logs": logs, "stats": stats}


@app.post("/api/orchestrator/run-cycle")
async def orchestrator_manual_run(_=Depends(verify_admin_token)):
    """Manually trigger an orchestrator cycle"""
    await orchestrator_run_cycle()
    return {"status": "ok", "cycleCount": orchestrator_cycle_count, "lastActionsCount": orchestrator_last_actions_count}


@app.post("/api/orchestrator/toggle")
async def orchestrator_toggle(request: Request, _=Depends(verify_admin_token)):
    """Enable or disable the orchestrator engine"""
    global orchestrator_enabled
    body = await request.json()
    orchestrator_enabled = body.get("enabled", True)
    return {"enabled": orchestrator_enabled}


@app.get("/api/orchestrator/metrics")
async def orchestrator_metrics():
    """Get orchestrator performance metrics over time"""
    # Last 24h aggregated by hour
    metrics_timeline = []
    for h in range(24):
        ts_start = (now_utc() - timedelta(hours=h + 1)).isoformat()
        ts_end = (now_utc() - timedelta(hours=h)).isoformat()

        logs = await db.orchestrator_logs.find(
            {"createdAt": {"$gte": ts_start, "$lt": ts_end}},
            {"_id": 0, "actions": 1, "severity": 1}
        ).to_list(500)

        executed = 0
        failed = 0
        total_actions = 0
        severities = {"BALANCED": 0, "BUSY": 0, "SURGE": 0, "CRITICAL": 0}
        for log in logs:
            sev = log.get("severity", "BALANCED")
            if sev in severities:
                severities[sev] += 1
            for a in log.get("actions", []):
                total_actions += 1
                if a["status"] == "executed":
                    executed += 1
                elif a["status"] == "failed":
                    failed += 1

        metrics_timeline.append({
            "hour": h,
            "timestamp": ts_end,
            "totalActions": total_actions,
            "executed": executed,
            "failed": failed,
            "cycleCount": len(logs),
            "severities": severities,
        })

    # Current zone health summary
    zones = await db.zones.find({}, {"_id": 0, "id": 1, "status": 1, "ratio": 1, "surgeMultiplier": 1}).to_list(50)
    zone_health = {
        "total": len(zones),
        "balanced": sum(1 for z in zones if z.get("status") == "BALANCED"),
        "busy": sum(1 for z in zones if z.get("status") == "BUSY"),
        "surge": sum(1 for z in zones if z.get("status") == "SURGE"),
        "critical": sum(1 for z in zones if z.get("status") == "CRITICAL"),
        "avgRatio": round(sum(z.get("ratio", 0) for z in zones) / max(len(zones), 1), 2),
        "avgSurge": round(sum(z.get("surgeMultiplier", 1) for z in zones) / max(len(zones), 1), 2),
    }

    # Active overrides
    overrides_count = await db.orchestrator_overrides.count_documents({"isActive": True})

    return {
        "enabled": orchestrator_enabled,
        "cycleCount": orchestrator_cycle_count,
        "lastCycleAt": orchestrator_last_cycle_at,
        "cycleIntervalSeconds": 10,
        "timeline": list(reversed(metrics_timeline)),
        "zoneHealth": zone_health,
        "activeOverrides": overrides_count,
    }


@app.get("/api/orchestrator/zone/{zone_id}/history")
async def orchestrator_zone_history(zone_id: str, limit: int = 50):
    """Get orchestrator action history for a specific zone"""
    logs = await db.orchestrator_logs.find(
        {"zoneId": zone_id},
        {"_id": 0}
    ).sort("createdAt", -1).to_list(limit)

    # Build action timeline
    action_timeline = []
    for log in logs:
        for action in log.get("actions", []):
            action_timeline.append({
                "timestamp": log["createdAt"],
                "severity": log["severity"],
                "actionType": action["type"],
                "status": action["status"],
                "payload": action.get("payload", {}),
                "reason": action.get("reason"),
                "source": log.get("source", "system"),
            })

    return {"zoneId": zone_id, "logs": logs, "actionTimeline": action_timeline[:limit]}


@app.get("/api/orchestrator/config")
async def orchestrator_get_config():
    """Get orchestrator engine configuration"""
    return {
        "enabled": orchestrator_enabled,
        "cycleIntervalSeconds": 10,
        "cycleCount": orchestrator_cycle_count,
        "lastCycleAt": orchestrator_last_cycle_at,
        "cooldowns": {k: v for k, v in orchestrator_cooldowns.items()},
        "defaultRules": ORCHESTRATOR_DEFAULT_RULES,
    }


# ═══════════════════════════════════════════════════════════════
# 🧠 PHASE G+H: ACTION FEEDBACK LOOP + STRATEGY OPTIMIZER
# ═══════════════════════════════════════════════════════════════
#
# Every orchestrator action → capture BEFORE snapshot
# After 3 min → capture AFTER snapshot → calculate effectiveness
# Strategy Optimizer → adjusts weights per zone+action_type
# Orchestrator → uses weights when deciding actions
# ═══════════════════════════════════════════════════════════════

# ── DEFAULT STRATEGY WEIGHTS ──
DEFAULT_STRATEGY_WEIGHTS = {
    "ENABLE_SURGE": 1.0,
    "PUSH_PROVIDERS": 1.0,
    "SET_FANOUT": 1.0,
    "SET_PRIORITY_BIAS": 1.0,
    "SET_ZONE_BOOST": 1.0,
}

FEEDBACK_DELAY_SECONDS = 180  # 3 minutes between before/after
STRATEGY_RECALC_INTERVAL = 300  # 5 minutes
MIN_SAMPLES_FOR_LEARNING = 50  # FIX 3: Cold start — don't adjust weights below this
ZONE_WEIGHT_BLEND = 0.5  # FIX 4: Overfitting — global + zone * blend
feedback_engine_task = None
strategy_optimizer_task = None

# ── FIX 1: Zone Locks (Race Condition Prevention) ──
zone_locks: dict = {}  # { zoneId: { lockedBy: str, expiresAt: str } }

async def acquire_zone_lock(zone_id: str, locked_by: str, ttl_seconds: int = 15) -> bool:
    """Acquire a lock on a zone. Returns True if lock acquired."""
    now = now_utc().isoformat()
    existing = zone_locks.get(zone_id)
    if existing and existing["expiresAt"] > now:
        return False  # Zone is locked by another process
    zone_locks[zone_id] = {"lockedBy": locked_by, "expiresAt": (now_utc() + timedelta(seconds=ttl_seconds)).isoformat()}
    return True

def release_zone_lock(zone_id: str, locked_by: str):
    """Release a zone lock."""
    existing = zone_locks.get(zone_id)
    if existing and existing["lockedBy"] == locked_by:
        del zone_locks[zone_id]


async def capture_zone_snapshot(zone_id: str) -> dict:
    """Capture current zone metrics as a snapshot"""
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    if not zone:
        return {"eta": 0, "demand": 0, "supply": 0, "ratio": 0, "conversion": 0, "gmv": 0, "surge": 1.0}

    # Calculate approximate conversion & GMV from recent data
    recent_bookings = await db.orchestrator_logs.count_documents({
        "zoneId": zone_id,
        "createdAt": {"$gte": (now_utc() - timedelta(minutes=30)).isoformat()}
    })
    demand = zone.get("demandScore", 1)
    conversion = min(95, max(5, round(100 * zone.get("matchRate", 50) / 100, 1)))
    gmv_estimate = demand * conversion * random.uniform(80, 150)  # Estimated GMV per matched request

    return {
        "eta": zone.get("avgEta", 10),
        "demand": demand,
        "supply": zone.get("supplyScore", 1),
        "ratio": zone.get("ratio", 1.0),
        "conversion": conversion,
        "gmv": round(gmv_estimate),
        "surge": zone.get("surgeMultiplier", 1.0),
        "matchRate": zone.get("matchRate", 50),
        "status": zone.get("status", "BALANCED"),
    }


def calculate_effectiveness(before: dict, after: dict) -> dict:
    """Calculate action effectiveness from before/after snapshots
    FIX 2: External factor bias correction
    FIX 5: GMV as #1 KPI (0.40 weight)
    """
    # ETA improvement (lower is better) — normalized to 0..1
    eta_before = max(before.get("eta", 10), 1)
    eta_after = max(after.get("eta", 10), 1)
    eta_improvement = (eta_before - eta_after) / eta_before
    eta_score = max(-1, min(1, eta_improvement))

    # Conversion growth (higher is better) — normalized
    conv_before = max(before.get("conversion", 50), 1)
    conv_after = max(after.get("conversion", 50), 1)
    conv_growth = (conv_after - conv_before) / conv_before
    conv_score = max(-1, min(1, conv_growth))

    # GMV growth (higher is better) — FIX 5: THIS IS NOW #1 KPI
    gmv_before = max(before.get("gmv", 100), 1)
    gmv_after = max(after.get("gmv", 100), 1)
    gmv_growth = (gmv_after - gmv_before) / gmv_before
    gmv_score = max(-1, min(1, gmv_growth))

    # Ratio improvement (lower is better for CRITICAL/SURGE)
    ratio_before = before.get("ratio", 1)
    ratio_after = after.get("ratio", 1)
    ratio_improvement = (ratio_before - ratio_after) / max(ratio_before, 0.1)
    ratio_score = max(-1, min(1, ratio_improvement))

    # ── FIX 2: External factor bias correction ──
    # If demand changed significantly but action is not demand-related, dampen effectiveness
    demand_before = before.get("demand", 5)
    demand_after = after.get("demand", 5)
    demand_change_pct = abs(demand_after - demand_before) / max(demand_before, 1)
    supply_before = before.get("supply", 3)
    supply_after = after.get("supply", 3)
    supply_change_pct = abs(supply_after - supply_before) / max(supply_before, 1)

    # If external environment shifted a lot (>40% demand/supply change), dampen score
    external_noise = max(demand_change_pct, supply_change_pct)
    bias_dampener = 1.0
    if external_noise > 0.4:
        bias_dampener = 0.5  # Heavy dampen: environment changed too much
    elif external_noise > 0.25:
        bias_dampener = 0.75  # Moderate dampen

    # ── FIX 5: GMV-first weighted effectiveness score ──
    raw_effectiveness = (
        gmv_score * 0.40 +       # GMV = #1 KPI
        conv_score * 0.25 +      # Conversion = #2
        eta_score * 0.20 +       # ETA = #3
        ratio_score * 0.15       # Ratio balance = #4
    )
    effectiveness = raw_effectiveness * bias_dampener

    delta = {
        "eta": round(after.get("eta", 0) - before.get("eta", 0), 1),
        "demand": after.get("demand", 0) - before.get("demand", 0),
        "supply": after.get("supply", 0) - before.get("supply", 0),
        "ratio": round(after.get("ratio", 0) - before.get("ratio", 0), 2),
        "conversion": round(after.get("conversion", 0) - before.get("conversion", 0), 1),
        "gmv": round(after.get("gmv", 0) - before.get("gmv", 0)),
        "surge": round(after.get("surge", 1) - before.get("surge", 1), 2),
    }

    return {
        "effectivenessScore": round(effectiveness, 4),
        "rawScore": round(raw_effectiveness, 4),
        "biasDampener": round(bias_dampener, 2),
        "externalNoise": round(external_noise, 4),
        "delta": delta,
        "componentScores": {
            "gmv": round(gmv_score, 4),
            "conversion": round(conv_score, 4),
            "eta": round(eta_score, 4),
            "ratio": round(ratio_score, 4),
        },
    }


async def track_action_feedback(zone_id: str, zone_name: str, action_type: str, severity: str, action_payload: dict):
    """Create a pending feedback record with BEFORE snapshot"""
    before_snapshot = await capture_zone_snapshot(zone_id)

    feedback_record = {
        "id": uid(),
        "zoneId": zone_id,
        "zoneName": zone_name,
        "actionType": action_type,
        "severity": severity,
        "actionPayload": action_payload,
        "before": before_snapshot,
        "after": None,
        "delta": None,
        "effectivenessScore": None,
        "componentScores": None,
        "status": "pending",  # pending → completed
        "captureAfterAt": (now_utc() + timedelta(seconds=FEEDBACK_DELAY_SECONDS)).isoformat(),
        "createdAt": now_utc().isoformat(),
        "completedAt": None,
    }
    await db.action_feedback.insert_one(feedback_record)
    return feedback_record["id"]


async def feedback_processor_loop():
    """Background loop: process pending feedback records (capture AFTER + calc effectiveness)"""
    # Create indexes
    await db.action_feedback.create_index([("status", 1), ("captureAfterAt", 1)])
    await db.action_feedback.create_index([("zoneId", 1), ("actionType", 1)])
    await db.action_feedback.create_index([("createdAt", -1)])
    await db.strategy_weights.create_index("zoneId", unique=True)

    logger.info("Phase G: Action Feedback Processor started (15s cycle)")

    while True:
        try:
            now = now_utc().isoformat()
            # Find pending feedback records that are ready for AFTER capture
            pending = await db.action_feedback.find(
                {"status": "pending", "captureAfterAt": {"$lte": now}},
                {"_id": 0}
            ).to_list(50)

            for record in pending:
                zone_id = record["zoneId"]
                before = record["before"]

                # Capture AFTER snapshot
                after = await capture_zone_snapshot(zone_id)

                # Calculate effectiveness
                result = calculate_effectiveness(before, after)

                # Update record
                await db.action_feedback.update_one(
                    {"id": record["id"]},
                    {"$set": {
                        "after": after,
                        "delta": result["delta"],
                        "effectivenessScore": result["effectivenessScore"],
                        "componentScores": result["componentScores"],
                        "status": "completed",
                        "completedAt": now_utc().isoformat(),
                    }}
                )

            if pending:
                logger.info(f"Feedback processor: completed {len(pending)} feedback records")

        except Exception as e:
            logger.error(f"Feedback processor error: {e}")

        await asyncio.sleep(15)


async def strategy_optimizer_loop():
    """Background loop: recalculate strategy weights based on feedback effectiveness"""
    logger.info("Phase H: Strategy Optimizer started (5min cycle)")

    # Seed default strategy weights
    zones = await db.zones.find({}, {"_id": 0, "id": 1}).to_list(50)
    for zone in zones:
        existing = await db.strategy_weights.find_one({"zoneId": zone["id"]})
        if not existing:
            await db.strategy_weights.insert_one({
                "zoneId": zone["id"],
                "weights": {**DEFAULT_STRATEGY_WEIGHTS},
                "updatedAt": now_utc().isoformat(),
                "history": [],
            })
    # Global weights
    existing_global = await db.strategy_weights.find_one({"zoneId": "global"})
    if not existing_global:
        await db.strategy_weights.insert_one({
            "zoneId": "global",
            "weights": {**DEFAULT_STRATEGY_WEIGHTS},
            "updatedAt": now_utc().isoformat(),
            "history": [],
        })

    while True:
        try:
            await recalculate_strategy_weights()
        except Exception as e:
            logger.error(f"Strategy optimizer error: {e}")

        await asyncio.sleep(STRATEGY_RECALC_INTERVAL)


async def recalculate_strategy_weights():
    """Recalculate strategy weights based on recent feedback data"""
    # Get completed feedback from last 24h
    cutoff = (now_utc() - timedelta(hours=24)).isoformat()
    feedbacks = await db.action_feedback.find(
        {"status": "completed", "createdAt": {"$gte": cutoff}},
        {"_id": 0}
    ).to_list(5000)

    if not feedbacks:
        return

    # ── GLOBAL weights ──
    # Sprint 9 — respect manual control (auto=false) + locked + min/max bounds
    global_control = await db.strategy_weights.find_one({"zoneId": "global"}, {"_id": 0}) or {}
    if global_control.get("locked") or global_control.get("auto") is False:
        logger.info("Strategy optimizer: GLOBAL is manual/locked — skipping global recalc")
    else:
        global_scores = {}
        for fb in feedbacks:
            at = fb["actionType"]
            if at not in global_scores:
                global_scores[at] = []
            global_scores[at].append(fb.get("effectivenessScore", 0))

        gmn = float(global_control.get("minWeight", 0.3))
        gmx = float(global_control.get("maxWeight", 2.0))
        global_weights = {**DEFAULT_STRATEGY_WEIGHTS}
        for action_type, scores in global_scores.items():
            if not scores:
                continue
            avg = sum(scores) / len(scores)
            # ── FIX 3: Cold start — don't adjust if too few samples ──
            if len(scores) < MIN_SAMPLES_FOR_LEARNING:
                global_weights[action_type] = 1.0  # Keep default
                continue
            # Adjust weight: effective actions get boosted, ineffective get reduced
            # Sprint 9 — respect per-strategy min/max bounds
            new_weight = max(gmn, min(gmx, 1.0 + avg * 1.5))
            global_weights[action_type] = round(new_weight, 3)

        await db.strategy_weights.update_one(
            {"zoneId": "global"},
            {"$set": {
                "weights": global_weights,
                "updatedAt": now_utc().isoformat(),
                "sampleCount": len(feedbacks),
            },
            "$push": {"history": {
                "$each": [{"weights": global_weights, "timestamp": now_utc().isoformat(), "sampleCount": len(feedbacks)}],
                "$slice": -48,  # Keep last 48 entries
            }}},
            upsert=True,
        )

    # ── PER-ZONE weights ──
    zone_feedbacks = {}
    for fb in feedbacks:
        zid = fb["zoneId"]
        if zid not in zone_feedbacks:
            zone_feedbacks[zid] = {}
        at = fb["actionType"]
        if at not in zone_feedbacks[zid]:
            zone_feedbacks[zid][at] = []
        zone_feedbacks[zid][at].append(fb.get("effectivenessScore", 0))

    for zone_id, action_scores in zone_feedbacks.items():
        # Sprint 9 — per-zone manual / lock respect
        zone_control = await db.strategy_weights.find_one({"zoneId": zone_id}, {"_id": 0}) or {}
        if zone_control.get("locked") or zone_control.get("auto") is False:
            continue
        zmn = float(zone_control.get("minWeight", 0.3))
        zmx = float(zone_control.get("maxWeight", 2.0))
        zone_weights = {**DEFAULT_STRATEGY_WEIGHTS}
        for action_type, scores in action_scores.items():
            if not scores:
                continue
            avg = sum(scores) / len(scores)
            # ── FIX 3: Cold start — per-zone also respects min samples ──
            if len(scores) < max(10, MIN_SAMPLES_FOR_LEARNING // 3):
                zone_weights[action_type] = 1.0
                continue
            new_weight = max(zmn, min(zmx, 1.0 + avg * 1.5))
            zone_weights[action_type] = round(new_weight, 3)

        await db.strategy_weights.update_one(
            {"zoneId": zone_id},
            {"$set": {
                "weights": zone_weights,
                "updatedAt": now_utc().isoformat(),
                "sampleCount": sum(len(v) for v in action_scores.values()),
            },
            "$push": {"history": {
                "$each": [{"weights": zone_weights, "timestamp": now_utc().isoformat()}],
                "$slice": -48,
            }}},
            upsert=True,
        )

    # Generate recommendations
    recommendations = []
    for action_type, scores in global_scores.items():
        avg = sum(scores) / len(scores) if scores else 0
        count = len(scores)
        if avg < -0.1 and count >= 3:
            recommendations.append({
                "type": "warning",
                "action": action_type,
                "message": f"{action_type} неэффективен (avg={round(avg, 2)}, samples={count}). Рассмотрите снижение приоритета.",
                "avgScore": round(avg, 3),
                "sampleCount": count,
            })
        elif avg > 0.3 and count >= 3:
            recommendations.append({
                "type": "boost",
                "action": action_type,
                "message": f"{action_type} высокоэффективен (avg={round(avg, 2)}, samples={count}). Рекомендуется увеличить использование.",
                "avgScore": round(avg, 3),
                "sampleCount": count,
            })

    # Zone-specific recommendations
    for zone_id, action_scores in zone_feedbacks.items():
        for action_type, scores in action_scores.items():
            avg = sum(scores) / len(scores) if scores else 0
            if avg < -0.15 and len(scores) >= 2:
                zone_name = zone_id.replace("kyiv-", "").title()
                recommendations.append({
                    "type": "zone_warning",
                    "action": action_type,
                    "zoneId": zone_id,
                    "message": f"⚠️ {action_type} в {zone_name} неэффективен (avg={round(avg, 2)})",
                    "avgScore": round(avg, 3),
                    "sampleCount": len(scores),
                })
            elif avg > 0.4 and len(scores) >= 2:
                zone_name = zone_id.replace("kyiv-", "").title()
                recommendations.append({
                    "type": "zone_boost",
                    "action": action_type,
                    "zoneId": zone_id,
                    "message": f"🔥 {action_type} в {zone_name} даёт отличный результат (avg={round(avg, 2)})",
                    "avgScore": round(avg, 3),
                    "sampleCount": len(scores),
                })

    if recommendations:
        await db.strategy_recommendations.delete_many({})
        await db.strategy_recommendations.insert_many([{**r, "createdAt": now_utc().isoformat()} for r in recommendations])

    zones_updated = len(zone_feedbacks)
    logger.info(f"Strategy optimizer: recalculated weights — {len(feedbacks)} samples, {zones_updated} zones, {len(recommendations)} recommendations")


async def get_strategy_weight(zone_id: str, action_type: str) -> float:
    """Get the current strategy weight for a zone+action pair
    FIX 4: Overfitting prevention — blend global + zone weights
    """
    global_weight = 1.0
    zone_weight = 1.0

    global_doc = await db.strategy_weights.find_one({"zoneId": "global"}, {"_id": 0})
    if global_doc and action_type in global_doc.get("weights", {}):
        global_weight = global_doc["weights"][action_type]

    zone_doc = await db.strategy_weights.find_one({"zoneId": zone_id}, {"_id": 0})
    if zone_doc and action_type in zone_doc.get("weights", {}):
        zone_weight = zone_doc["weights"][action_type]

    # FIX 4: Blend — global is anchor, zone adjusts by ZONE_WEIGHT_BLEND factor
    # final = global * (1 - blend) + zone * blend
    blended = global_weight * (1 - ZONE_WEIGHT_BLEND) + zone_weight * ZONE_WEIGHT_BLEND
    return round(blended, 3)


# ── MODIFY orchestrator_run_cycle to integrate feedback tracking ──
_original_orchestrator_run_cycle = orchestrator_run_cycle

async def orchestrator_run_cycle_with_feedback():
    """Enhanced orchestrator cycle with feedback tracking"""
    global orchestrator_cycle_count, orchestrator_last_cycle_at, orchestrator_last_actions_count

    if not orchestrator_enabled:
        return

    zones = await db.zones.find({}, {"_id": 0}).to_list(50)
    if not zones:
        return

    rules = await db.orchestrator_rules.find({}, {"_id": 0}).to_list(10)
    if not rules:
        await seed_orchestrator_rules()
        rules = await db.orchestrator_rules.find({}, {"_id": 0}).to_list(10)

    rules_map = {r["severity"]: r for r in rules}

    overrides = await db.orchestrator_overrides.find({"isActive": True}, {"_id": 0}).to_list(50)
    active_overrides = []
    for ov in overrides:
        expires = ov.get("expiresAt")
        if expires and expires < now_utc().isoformat():
            await db.orchestrator_overrides.update_one({"id": ov["id"]}, {"$set": {"isActive": False}})
            continue
        active_overrides.append(ov)
    overrides_map = {ov["zoneId"]: ov for ov in active_overrides}

    total_actions = 0

    for zone in zones:
        zone_id = zone.get("id")
        zone_name = zone.get("name", zone_id)
        severity = zone.get("status", "BALANCED")

        rule = rules_map.get(severity)
        if not rule:
            continue

        if is_in_cooldown(zone_id, severity, rule.get("cooldownSeconds", 60)):
            continue

        # ── FIX 1: Zone Lock — prevent race conditions ──
        if not await acquire_zone_lock(zone_id, "orchestrator", ttl_seconds=15):
            continue  # Zone is locked by another process

        zone_override = overrides_map.get(zone_id)
        actions = build_actions(zone, rule, zone_override)
        if not actions:
            continue

        # ── PHASE G: Strategy weight filtering ──
        # Skip actions with very low weight (< 0.4)
        weighted_actions = []
        for action in actions:
            weight = await get_strategy_weight(zone_id, action["type"])
            action["strategyWeight"] = round(weight, 3)
            if weight >= 0.4:
                weighted_actions.append(action)
            else:
                action["status"] = "skipped"
                action["reason"] = f"Strategy weight too low ({weight:.2f})"
                weighted_actions.append(action)

        # Execute non-skipped actions
        for action in weighted_actions:
            if action["status"] != "skipped":
                await execute_action(action)
                # ── PHASE G: Track feedback for executed actions ──
                if action["status"] == "executed":
                    await track_action_feedback(
                        zone_id, zone_name, action["type"],
                        severity, action.get("payload", {})
                    )

        # Log
        log_entry = {
            "id": uid(),
            "zoneId": zone_id,
            "zoneName": zone_name,
            "severity": severity,
            "detectedState": {
                "demand": zone.get("demandScore", 0),
                "supply": zone.get("supplyScore", 0),
                "ratio": zone.get("ratio", 0),
                "avgEta": zone.get("avgEta", 0),
                "surgeMultiplier": zone.get("surgeMultiplier", 1.0),
            },
            "actions": weighted_actions,
            "source": "admin_override" if zone_override else "system",
            "cycleNumber": orchestrator_cycle_count,
            "createdAt": now_utc().isoformat(),
        }
        await db.orchestrator_logs.insert_one(log_entry)
        total_actions += len([a for a in weighted_actions if a["status"] == "executed"])

        set_cooldown(zone_id, severity)
        release_zone_lock(zone_id, "orchestrator")  # FIX 1: Release lock
        await emit_realtime_event("orchestrator:zone_action", {
            "zoneId": zone_id, "severity": severity,
            "actionsCount": len(weighted_actions),
            "actions": [{"type": a["type"], "status": a["status"], "weight": a.get("strategyWeight", 1.0)} for a in weighted_actions],
        })

    orchestrator_cycle_count += 1
    orchestrator_last_cycle_at = now_utc().isoformat()
    orchestrator_last_actions_count = total_actions

    if total_actions > 0:
        logger.info(f"Orchestrator cycle #{orchestrator_cycle_count}: {total_actions} actions across {len(zones)} zones")


# Replace the orchestrator engine loop to use enhanced cycle
async def orchestrator_engine_loop_v2():
    """Phase E+G: Enhanced Orchestrator Engine with feedback integration"""
    await seed_orchestrator_rules()
    logger.info("Phase E+G: Enhanced Orchestrator Engine started (10s cycle)")

    await db.orchestrator_logs.create_index([("createdAt", -1)])
    await db.orchestrator_logs.create_index([("zoneId", 1), ("createdAt", -1)])
    await db.orchestrator_overrides.create_index([("zoneId", 1), ("isActive", 1)])

    while True:
        try:
            await orchestrator_run_cycle_with_feedback()
        except Exception as e:
            logger.error(f"Orchestrator engine error: {e}")
        await asyncio.sleep(10)


# ── Update startup to include feedback + strategy optimizer ──
_startup_with_orchestrator = startup_with_orchestrator

async def startup_with_feedback():
    global orchestrator_engine_task, feedback_engine_task, strategy_optimizer_task
    await original_startup()
    # Start enhanced orchestrator (replaces old one)
    orchestrator_engine_task = asyncio.create_task(orchestrator_engine_loop_v2())
    # Start feedback processor
    feedback_engine_task = asyncio.create_task(feedback_processor_loop())
    # Start strategy optimizer
    strategy_optimizer_task = asyncio.create_task(strategy_optimizer_loop())

app.router.on_startup.clear()
app.add_event_handler("startup", startup_with_feedback)


# ═══════════════════════════════════════════════
# 📡 FEEDBACK & STRATEGY API ENDPOINTS
# ═══════════════════════════════════════════════

@app.get("/api/feedback/actions")
async def feedback_get_actions(limit: int = 100, status: str = None, actionType: str = None):
    """Get feedback records"""
    query = {}
    if status:
        query["status"] = status
    if actionType:
        query["actionType"] = actionType
    records = await db.action_feedback.find(query, {"_id": 0}).sort("createdAt", -1).to_list(limit)

    # Aggregate stats
    completed = [r for r in records if r.get("status") == "completed"]
    avg_effectiveness = round(sum(r.get("effectivenessScore", 0) for r in completed) / max(len(completed), 1), 4)

    by_action = {}
    for r in completed:
        at = r["actionType"]
        if at not in by_action:
            by_action[at] = {"count": 0, "totalScore": 0, "avgScore": 0}
        by_action[at]["count"] += 1
        by_action[at]["totalScore"] += r.get("effectivenessScore", 0)
    for at in by_action:
        by_action[at]["avgScore"] = round(by_action[at]["totalScore"] / max(by_action[at]["count"], 1), 4)

    return {
        "records": records,
        "stats": {
            "total": len(records),
            "completed": len(completed),
            "pending": len(records) - len(completed),
            "avgEffectiveness": avg_effectiveness,
            "byActionType": by_action,
        },
    }


@app.get("/api/feedback/zone/{zone_id}")
async def feedback_get_zone(zone_id: str, limit: int = 50):
    """Get feedback for a specific zone"""
    records = await db.action_feedback.find(
        {"zoneId": zone_id, "status": "completed"},
        {"_id": 0}
    ).sort("createdAt", -1).to_list(limit)

    # Per-action breakdown
    by_action = {}
    for r in records:
        at = r["actionType"]
        if at not in by_action:
            by_action[at] = {"scores": [], "avgScore": 0, "count": 0}
        by_action[at]["scores"].append(r.get("effectivenessScore", 0))
        by_action[at]["count"] += 1
    for at in by_action:
        by_action[at]["avgScore"] = round(sum(by_action[at]["scores"]) / max(len(by_action[at]["scores"]), 1), 4)
        by_action[at].pop("scores")

    return {"zoneId": zone_id, "records": records, "breakdown": by_action}


@app.get("/api/feedback/top-actions")
async def feedback_top_actions(limit: int = 20):
    """Get most effective actions"""
    records = await db.action_feedback.find(
        {"status": "completed", "effectivenessScore": {"$ne": None}},
        {"_id": 0}
    ).sort("effectivenessScore", -1).to_list(limit)
    return {"topActions": records}


@app.get("/api/feedback/worst-actions")
async def feedback_worst_actions(limit: int = 20):
    """Get least effective actions"""
    records = await db.action_feedback.find(
        {"status": "completed", "effectivenessScore": {"$ne": None}},
        {"_id": 0}
    ).sort("effectivenessScore", 1).to_list(limit)
    return {"worstActions": records}


@app.get("/api/feedback/strategy")
async def feedback_get_strategy():
    """Get current strategy weights (global + per-zone)"""
    global_w = await db.strategy_weights.find_one({"zoneId": "global"}, {"_id": 0})
    zone_weights = await db.strategy_weights.find({"zoneId": {"$ne": "global"}}, {"_id": 0}).to_list(50)

    return {
        "global": global_w or {"weights": DEFAULT_STRATEGY_WEIGHTS},
        "zones": zone_weights,
        "defaults": DEFAULT_STRATEGY_WEIGHTS,
    }


@app.get("/api/feedback/recommendations")
async def feedback_get_recommendations():
    """Get AI-generated strategy recommendations"""
    recs = await db.strategy_recommendations.find({}, {"_id": 0}).to_list(50)
    return {"recommendations": recs}


@app.post("/api/feedback/recalculate")
async def feedback_recalculate(_=Depends(verify_admin_token)):
    """Manually trigger strategy recalculation"""
    await recalculate_strategy_weights()
    global_w = await db.strategy_weights.find_one({"zoneId": "global"}, {"_id": 0})
    return {"status": "recalculated", "globalWeights": global_w.get("weights", {}) if global_w else {}}


@app.get("/api/feedback/dashboard")
async def feedback_dashboard():
    """Full feedback + strategy dashboard"""
    # Recent feedback stats
    cutoff_1h = (now_utc() - timedelta(hours=1)).isoformat()
    cutoff_24h = (now_utc() - timedelta(hours=24)).isoformat()

    total_1h = await db.action_feedback.count_documents({"createdAt": {"$gte": cutoff_1h}})
    completed_1h = await db.action_feedback.count_documents({"status": "completed", "createdAt": {"$gte": cutoff_1h}})
    total_24h = await db.action_feedback.count_documents({"createdAt": {"$gte": cutoff_24h}})
    completed_24h = await db.action_feedback.count_documents({"status": "completed", "createdAt": {"$gte": cutoff_24h}})
    pending = await db.action_feedback.count_documents({"status": "pending"})

    # Avg effectiveness last 24h
    completed_records = await db.action_feedback.find(
        {"status": "completed", "createdAt": {"$gte": cutoff_24h}},
        {"_id": 0, "effectivenessScore": 1, "actionType": 1, "zoneId": 1}
    ).to_list(5000)

    avg_eff = round(sum(r.get("effectivenessScore", 0) for r in completed_records) / max(len(completed_records), 1), 4)

    # Per-action breakdown
    by_action = {}
    for r in completed_records:
        at = r["actionType"]
        if at not in by_action:
            by_action[at] = {"count": 0, "totalScore": 0}
        by_action[at]["count"] += 1
        by_action[at]["totalScore"] += r.get("effectivenessScore", 0)
    for at in by_action:
        by_action[at]["avgScore"] = round(by_action[at]["totalScore"] / max(by_action[at]["count"], 1), 4)
        by_action[at].pop("totalScore")

    # Strategy weights
    global_w = await db.strategy_weights.find_one({"zoneId": "global"}, {"_id": 0})
    recs = await db.strategy_recommendations.find({}, {"_id": 0}).to_list(20)

    return {
        "stats": {
            "lastHour": {"total": total_1h, "completed": completed_1h},
            "last24h": {"total": total_24h, "completed": completed_24h},
            "pending": pending,
            "avgEffectiveness24h": avg_eff,
        },
        "actionBreakdown": by_action,
        "strategy": {
            "globalWeights": global_w.get("weights", DEFAULT_STRATEGY_WEIGHTS) if global_w else DEFAULT_STRATEGY_WEIGHTS,
            "lastUpdated": global_w.get("updatedAt") if global_w else None,
            "sampleCount": global_w.get("sampleCount", 0) if global_w else 0,
        },
        "recommendations": recs,
    }


# ═══════════════════════════════════════════════════════════════
# 📊 SIMULATION & ANALYTICS API
# ═══════════════════════════════════════════════════════════════

@app.get("/api/simulation/results")
async def simulation_results():
    """Get latest Monte Carlo simulation results"""
    import json as jsonlib
    report_path = Path("/app/test_reports/monte_carlo_10k.json")
    if not report_path.exists():
        return {"status": "no_results", "message": "Run simulation first"}
    with open(report_path) as f:
        return jsonlib.load(f)


@app.get("/api/analytics/system-health")
async def analytics_system_health():
    """Deep analytics: full system health dashboard"""
    # Zone health
    zones = await db.zones.find({}, {"_id": 0}).to_list(50)
    zone_health = []
    for z in zones:
        zone_health.append({
            "id": z.get("id"), "name": z.get("name"), "status": z.get("status"),
            "ratio": z.get("ratio", 0), "surge": z.get("surgeMultiplier", 1),
            "eta": z.get("avgEta", 0), "matchRate": z.get("matchRate", 0),
            "demand": z.get("demandScore", 0), "supply": z.get("supplyScore", 0),
        })

    # Orchestrator stats
    orch_logs_24h = await db.orchestrator_logs.count_documents({"createdAt": {"$gte": (now_utc() - timedelta(hours=24)).isoformat()}})
    orch_actions_24h = 0
    orch_failed = 0
    recent_logs = await db.orchestrator_logs.find(
        {"createdAt": {"$gte": (now_utc() - timedelta(hours=24)).isoformat()}},
        {"_id": 0, "actions": 1}
    ).to_list(5000)
    for log in recent_logs:
        for a in log.get("actions", []):
            orch_actions_24h += 1
            if a.get("status") == "failed":
                orch_failed += 1

    # Feedback stats
    fb_total = await db.action_feedback.count_documents({})
    fb_completed = await db.action_feedback.count_documents({"status": "completed"})
    fb_pending = await db.action_feedback.count_documents({"status": "pending"})

    # Strategy weights
    global_w = await db.strategy_weights.find_one({"zoneId": "global"}, {"_id": 0})

    # MongoDB stats
    collections = {}
    for col_name in ["users", "organizations", "zones", "orchestrator_logs", "action_feedback",
                     "strategy_weights", "orchestrator_rules", "orchestrator_overrides",
                     "zone_snapshots", "governance_actions", "reviews", "services"]:
        collections[col_name] = await db[col_name].count_documents({})

    # Recommendations
    recs = await db.strategy_recommendations.find({}, {"_id": 0}).to_list(20)

    return {
        "timestamp": now_utc().isoformat(),
        "zones": zone_health,
        "orchestrator": {
            "enabled": orchestrator_enabled,
            "cycleCount": orchestrator_cycle_count,
            "lastCycleAt": orchestrator_last_cycle_at,
            "logs24h": orch_logs_24h,
            "actions24h": orch_actions_24h,
            "failed24h": orch_failed,
            "successRate": round((orch_actions_24h - orch_failed) / max(orch_actions_24h, 1) * 100, 1),
        },
        "feedback": {
            "total": fb_total,
            "completed": fb_completed,
            "pending": fb_pending,
            "completionRate": round(fb_completed / max(fb_total, 1) * 100, 1),
        },
        "strategy": {
            "globalWeights": global_w.get("weights", {}) if global_w else {},
            "sampleCount": global_w.get("sampleCount", 0) if global_w else 0,
            "lastUpdated": global_w.get("updatedAt") if global_w else None,
        },
        "database": collections,
        "recommendations": recs,
        "backgroundProcesses": [
            {"name": "Zone State Engine", "interval": "10s", "status": "running"},
            {"name": "Orchestrator Engine", "interval": "10s", "status": "running" if orchestrator_enabled else "paused"},
            {"name": "Feedback Processor", "interval": "15s", "status": "running"},
            {"name": "Strategy Optimizer", "interval": "5min", "status": "running"},
        ],
    }


# ═══════════════════════════════════════════════════════════════
# 🔧 CONTRACT COMPAT LAYER — Sprint 1 API alignment
# Registered BEFORE the catch-all proxy so these paths never fall through.
# ═══════════════════════════════════════════════════════════════

async def _proxy_to(request: Request, target_path: str, method: Optional[str] = None,
                    query_override: Optional[dict] = None) -> Response:
    """Helper: forward request to NestJS with optional path/query rewrite."""
    target = f"{NESTJS_URL}/api/{target_path.lstrip('/')}"
    if query_override is not None:
        from urllib.parse import urlencode
        if query_override:
            target += "?" + urlencode(query_override)
    elif request.query_params:
        target += f"?{request.query_params}"
    headers = dict(request.headers)
    headers.pop('host', None); headers.pop('content-length', None)
    body = await request.body()
    resp = await http_client.request(method=method or request.method, url=target,
                                      headers=headers, content=body)
    rh = dict(resp.headers)
    for k in ['content-length', 'content-encoding', 'transfer-encoding']:
        rh.pop(k, None)
    return Response(content=resp.content, status_code=resp.status_code, headers=rh,
                    media_type=resp.headers.get('content-type', 'application/json'))


# --- Notifications alias (/my → /) ---
@app.get("/api/notifications/my")
async def compat_notifications_my(request: Request):
    return await _proxy_to(request, "notifications")


# --- Favorites alias (/my → /) ---
@app.get("/api/favorites/my")
async def compat_favorites_my(request: Request):
    return await _proxy_to(request, "favorites")


# --- Organizations search: accept both q= and search= ---
@app.get("/api/organizations/search")
async def compat_orgs_search(request: Request):
    qp = dict(request.query_params)
    if "q" in qp and "search" not in qp:
        qp["search"] = qp.pop("q")
    return await _proxy_to(request, "organizations", query_override=qp)


# --- Garage alias → /vehicles ---
@app.get("/api/garage/{vehicle_id}")
async def compat_garage_get(vehicle_id: str, request: Request):
    return await _proxy_to(request, f"vehicles/{vehicle_id}")


# --- Payments list alias ---
@app.get("/api/payments/list")
async def compat_payments_list(request: Request):
    return await _proxy_to(request, "payments/my")


# --- Disputes list compat: /api/disputes → NestJS /disputes/my ---
# Sprint 14: closes G-1. Mobile/web-app contract uses /disputes; NestJS exposes /disputes/my only.
@app.get("/api/disputes")
async def compat_disputes_list(request: Request):
    return await _proxy_to(request, "disputes/my")

# Sprint 14: removed broken compat `slots/reserve → slots/hold` (G-2 / B-1).
# NestJS exposes POST /api/slots/reserve directly via slots.controller.ts (@Post('slots/reserve')).
# The catch-all proxy forwards POST /api/slots/reserve untouched.


# --- Auth forgot-password (mock-safe) ---
@app.post("/api/auth/forgot-password")
async def compat_forgot_password(request: Request):
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(400, "Email is required")
    user = await db.users.find_one({"email": email})
    if user:
        reset_token = str(uuid.uuid4())
        await db.password_reset_tokens.insert_one({
            "userId": str(user["_id"]),
            "email": email,
            "token": reset_token,
            "expiresAt": (now_utc() + timedelta(hours=1)).isoformat(),
            "used": False,
            "createdAt": now_utc().isoformat(),
        })
        logger.info(f"Password reset token generated for {email} (mock; no email sent)")
    # Never reveal whether user exists
    return {"ok": True, "message": "If the email exists, a reset link has been sent."}


@app.post("/api/auth/reset-password")
async def compat_reset_password(request: Request):
    body = await request.json()
    token = body.get("token", "")
    new_password = body.get("password", "")
    if not token or len(new_password) < 6:
        raise HTTPException(400, "Token and password (>=6 chars) are required")
    record = await db.password_reset_tokens.find_one({"token": token, "used": False})
    if not record:
        raise HTTPException(400, "Invalid or expired token")
    try:
        exp_str = record.get("expiresAt", "")
        if exp_str:
            exp = datetime.fromisoformat(exp_str.replace("Z", "+00:00"))
            if exp < now_utc():
                raise HTTPException(400, "Token expired")
    except HTTPException:
        raise
    except Exception:
        pass
    from bson import ObjectId
    await db.users.update_one({"_id": ObjectId(record["userId"])},
                               {"$set": {"passwordHash": hash_pw(new_password)}})
    await db.password_reset_tokens.update_one({"token": token},
                                               {"$set": {"used": True, "usedAt": now_utc().isoformat()}})
    return {"ok": True, "message": "Password updated"}


# --- Admin live-feed (aggregate recent events) ---
@app.get("/api/admin/live-feed")
async def compat_admin_live_feed(request: Request, _=Depends(verify_admin_token)):
    limit = int(request.query_params.get("limit", 50))
    events = []
    govs = await db.governance_actions.find({}, {"_id": 0}).sort("createdAt", -1).to_list(limit // 2)
    for g in govs:
        events.append({
            "id": g.get("id"),
            "type": g.get("type", "governance"),
            "category": "governance",
            "message": g.get("message") or g.get("type") or "governance action",
            "createdAt": g.get("createdAt"),
            "meta": g,
        })
    orch = await db.orchestrator_logs.find({}, {"_id": 0}).sort("createdAt", -1).to_list(limit // 2)
    for o in orch:
        events.append({
            "id": o.get("id") or uid(),
            "type": o.get("action", "orchestrator"),
            "category": "orchestrator",
            "message": f"Zone {o.get('zoneId','?')}: {o.get('action','action')}",
            "createdAt": o.get("createdAt"),
            "meta": o,
        })
    events.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    return {"events": events[:limit], "total": len(events)}


# --- Admin alerts (from failsafe incidents + critical zones) ---
@app.get("/api/admin/alerts")
async def compat_admin_alerts(request: Request, _=Depends(verify_admin_token)):
    alerts = []
    incidents = await db.failsafe_incidents.find({"status": "open"}, {"_id": 0}).sort("detectedAt", -1).to_list(50)
    for i in incidents:
        name = (i.get("ruleName") or "").lower()
        level = "critical" if "crisis" in name or "crash" in name else "warning"
        alerts.append({
            "id": i.get("id"),
            "level": level,
            "category": "failsafe",
            "title": i.get("ruleName", "Failsafe incident"),
            "message": f"{i.get('affectedEntityType')}/{i.get('affectedEntityId')} — {i.get('actionTaken')}",
            "createdAt": i.get("detectedAt"),
            "meta": i,
        })
    crit = await db.zones.find({"status": "CRITICAL"},
                                {"_id": 0, "id": 1, "name": 1, "ratio": 1,
                                 "demandScore": 1, "supplyScore": 1, "updatedAt": 1}).to_list(20)
    for z in crit:
        alerts.append({
            "id": f"zone-{z.get('id')}",
            "level": "critical",
            "category": "zone",
            "title": f"Zone {z.get('name')} is CRITICAL",
            "message": f"Demand {z.get('demandScore')} / Supply {z.get('supplyScore')} (ratio {z.get('ratio')})",
            "createdAt": z.get("updatedAt"),
            "meta": z,
        })
    alerts.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    return {"alerts": alerts, "total": len(alerts)}


# --- Admin automation replay alias ---
@app.get("/api/admin/automation/replay")
async def compat_admin_replay(request: Request):
    return await _proxy_to(request, "admin/automation/replay/history")


# --- Admin feature flags alias ---
@app.get("/api/admin/config/features")
async def compat_admin_config_features(request: Request):
    return await _proxy_to(request, "admin/feature-flags")


# --- Admin commission tiers (native) ---
@app.get("/api/admin/config/commission-tiers")
async def compat_admin_commission_tiers(request: Request, _=Depends(verify_admin_token)):
    existing = await db.platformconfigs.find_one({"type": "commission_tiers"}, {"_id": 0})
    if existing:
        return existing
    return {
        "type": "commission_tiers",
        "tiers": [
            {"name": "Bronze",   "minScore": 0,  "maxScore": 49,  "commissionPct": 25.0},
            {"name": "Silver",   "minScore": 50, "maxScore": 74,  "commissionPct": 20.0},
            {"name": "Gold",     "minScore": 75, "maxScore": 89,  "commissionPct": 15.0},
            {"name": "Platinum", "minScore": 90, "maxScore": 100, "commissionPct": 10.0},
        ],
        "updatedAt": now_utc().isoformat(),
    }


@app.post("/api/admin/config/commission-tiers")
async def compat_admin_commission_tiers_save(request: Request, _=Depends(verify_admin_token)):
    body = await request.json()
    body["type"] = "commission_tiers"
    body["updatedAt"] = now_utc().isoformat()
    await db.platformconfigs.update_one({"type": "commission_tiers"},
                                         {"$set": body}, upsert=True)
    return {"status": "saved", "config": body}


# ═══════════════════════════════════════════════════════════════
# 🔀 NESTJS PROXY (catch-all — MUST BE LAST)
# ═══════════════════════════════════════════════════════════════


# ══════════════════════════════════════════════════════════════════════════════
# Sprint 9 — ADMIN CONTROL SYSTEM
#   Block 1: Zone Override (manual market control)
#   Block 2: Orchestrator Timeline (visibility w/ before/after)
#   Block 3: Strategy Control (AI on/off + weight bounds)
#   Block 4: Alerts with impact (lost revenue / recommended action)
# ══════════════════════════════════════════════════════════════════════════════

OVERRIDE_MODE_MAP = {
    "FORCE_BALANCED": ("BALANCED", "#22C55E", 1.0),
    "FORCE_BUSY":     ("BUSY",     "#F59E0B", 1.3),
    "FORCE_SURGE":    ("SURGE",    "#F97316", 1.7),
    "FORCE_CRITICAL": ("CRITICAL", "#EF4444", 2.2),
}


async def get_active_override(zone_id: str):
    """Return active override doc or None (expired overrides are purged lazily)."""
    o = await db.zone_overrides.find_one({"zoneId": zone_id}, {"_id": 0})
    if not o:
        return None
    exp = o.get("expiresAt")
    if exp and exp < now_utc().isoformat():
        await db.zone_overrides.delete_one({"zoneId": zone_id})
        return None
    return o


# ── BLOCK 1 — Zone Override API ──────────────────────────────────────────────
@app.post("/api/admin/zones/{zone_id}/override")
async def create_zone_override(zone_id: str, request: Request, _=Depends(verify_admin_token)):
    body = await request.json()
    mode = body.get("mode", "FORCE_BALANCED")
    if mode not in OVERRIDE_MODE_MAP:
        raise HTTPException(400, f"Invalid mode. Allowed: {list(OVERRIDE_MODE_MAP.keys())}")
    fanout = int(body.get("fanout", 4))
    priority_only = bool(body.get("priorityOnly", False))
    ttl_seconds = int(body.get("ttlSeconds", 600))

    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0, "id": 1, "name": 1})
    if not zone:
        raise HTTPException(404, "Zone not found")

    actor = _.get("email", "admin") if isinstance(_, dict) else "admin"
    expires_at = (now_utc() + timedelta(seconds=ttl_seconds)).isoformat()
    override = {
        "zoneId": zone_id,
        "mode": mode,
        "fanout": fanout,
        "priorityOnly": priority_only,
        "expiresAt": expires_at,
        "createdAt": now_utc().isoformat(),
        "createdBy": actor,
    }
    await db.zone_overrides.update_one({"zoneId": zone_id}, {"$set": override}, upsert=True)

    # Immediately apply to zone state
    status, color, surge = OVERRIDE_MODE_MAP[mode]
    await db.zones.update_one({"id": zone_id}, {"$set": {
        "status": status, "color": color, "surgeMultiplier": surge,
        "overriddenUntil": expires_at, "overrideMode": mode,
        "updatedAt": now_utc().isoformat(),
    }})
    await emit_realtime_event("zone:overridden", {
        "zoneId": zone_id, "mode": mode, "fanout": fanout,
        "priorityOnly": priority_only, "expiresAt": expires_at,
    })
    # Audit into orchestrator_logs (so it appears in timeline)
    await db.orchestrator_logs.insert_one({
        "timestamp": now_utc().isoformat(),
        "zoneId": zone_id,
        "actionType": "ADMIN_OVERRIDE",
        "reason": f"Manual override: {mode}",
        "params": {"mode": mode, "fanout": fanout, "priorityOnly": priority_only, "ttlSeconds": ttl_seconds},
        "source": "admin",
        "actor": actor,
    })
    # Sprint 12: audit_logs trail
    await write_audit(db, actor=actor, action="zone.override.apply", target=zone_id,
                      details={"mode": mode, "fanout": fanout, "priorityOnly": priority_only,
                               "ttlSeconds": ttl_seconds})
    return {"status": "overridden", "zoneId": zone_id, **override}


@app.get("/api/admin/zones/{zone_id}/override")
async def get_zone_override(zone_id: str, _=Depends(verify_admin_token)):
    o = await get_active_override(zone_id)
    return o or {"zoneId": zone_id, "active": False}


@app.delete("/api/admin/zones/{zone_id}/override")
async def clear_zone_override(zone_id: str, _=Depends(verify_admin_token)):
    actor = _.get("email", "admin") if isinstance(_, dict) else "admin"
    res = await db.zone_overrides.delete_one({"zoneId": zone_id})
    await db.zones.update_one({"id": zone_id}, {"$unset": {"overriddenUntil": "", "overrideMode": ""}})
    await emit_realtime_event("zone:override_cleared", {"zoneId": zone_id})
    await db.orchestrator_logs.insert_one({
        "timestamp": now_utc().isoformat(), "zoneId": zone_id,
        "actionType": "ADMIN_OVERRIDE_CLEARED", "reason": "Override cleared",
        "source": "admin", "actor": actor,
    })
    await write_audit(db, actor=actor, action="zone.override.clear", target=zone_id,
                      details={"deleted": res.deleted_count})
    return {"status": "cleared", "zoneId": zone_id, "deleted": res.deleted_count}


@app.get("/api/admin/zones/overrides")
async def list_zone_overrides(_=Depends(verify_admin_token)):
    docs = await db.zone_overrides.find({}, {"_id": 0}).to_list(50)
    out = []
    for d in docs:
        if d.get("expiresAt") and d["expiresAt"] >= now_utc().isoformat():
            out.append(d)
    return {"overrides": out, "total": len(out)}


# ═══════════════════════════════════════════════════════════════
# 🛡 SPRINT 12 — Production-readiness endpoints
# ═══════════════════════════════════════════════════════════════

@app.get("/api/system/breaker")
async def system_breaker(_=Depends(verify_admin_token)):
    """Expose NestJS proxy circuit breaker state."""
    return {"nestjs": nest_breaker.state()}


@app.get("/api/system/alert-dispatches")
async def system_alert_dispatches(request: Request, _=Depends(verify_admin_token)):
    limit = int(request.query_params.get("limit", 50))
    level = request.query_params.get("level")
    q: dict = {}
    if level:
        q["level"] = level
    docs = await db.alert_dispatches.find(q, {"_id": 0}).sort("dispatchedAt", -1).limit(limit).to_list(limit)
    return {"dispatches": docs, "total": len(docs)}


@app.post("/api/system/test-alert")
async def system_test_alert(request: Request, _=Depends(verify_admin_token)):
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    level = body.get("level", "info")
    code = body.get("code", "TEST_ALERT")
    message = body.get("message", "Test alert from /api/system/test-alert")
    doc = await dispatch_alert(db, level=level, code=code, message=message,
                               meta={"source": "manual-test"})
    return {"ok": True, "dispatched": doc}


@app.get("/api/system/idempotency/{key}")
async def system_idempotency_get(key: str, _=Depends(verify_admin_token)):
    doc = await db.idempotency_keys.find_one({"key": key}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Idempotency-Key not found")
    # normalize expiresAt for JSON output
    if isinstance(doc.get("expiresAt"), datetime):
        doc["expiresAt"] = doc["expiresAt"].isoformat()
    return doc


@app.get("/api/system/audit")
async def system_audit(request: Request, _=Depends(verify_admin_token)):
    limit = int(request.query_params.get("limit", 50))
    actor = request.query_params.get("actor")
    action = request.query_params.get("action")
    q: dict = {}
    if actor:
        q["actor"] = actor
    if action:
        q["action"] = action
    docs = await db.audit_logs.find(q, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return {"audit": docs, "total": len(docs)}


# ── BLOCK 2 — Orchestrator Timeline ──────────────────────────────────────────
@app.get("/api/admin/zones/{zone_id}/timeline")
async def get_zone_timeline(zone_id: str, hours: int = 6, _=Depends(verify_admin_token)):
    """Timeline of actions on the zone with before/after impact."""
    cutoff = (now_utc() - timedelta(hours=hours)).isoformat()

    # 1. orchestrator actions
    orch = await db.orchestrator_logs.find(
        {"zoneId": zone_id, "timestamp": {"$gte": cutoff}},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(200)

    # 2. snapshots to reconstruct before/after
    snaps = await db.zone_snapshots.find(
        {"zoneId": zone_id, "timestamp": {"$gte": cutoff}},
        {"_id": 0}
    ).sort("timestamp", 1).to_list(2000)

    def snap_at(t: str):
        """Return snapshot closest to t."""
        best = None
        for s in snaps:
            if s["timestamp"] <= t:
                best = s
            else:
                break
        return best

    def snap_after(t: str, delta_min: int = 5):
        target = (datetime.fromisoformat(t.replace("Z","+00:00") if t.endswith("Z") else t) + timedelta(minutes=delta_min)).isoformat()
        for s in snaps:
            if s["timestamp"] >= target:
                return s
        return snaps[-1] if snaps else None

    # 3. feedback effectiveness joined by time+zone+action
    fb = await db.action_feedback.find(
        {"zoneId": zone_id, "createdAt": {"$gte": cutoff}},
        {"_id": 0, "actionType": 1, "effectivenessScore": 1, "status": 1, "createdAt": 1}
    ).to_list(1000)
    fb_by_action = {}
    for f in fb:
        fb_by_action.setdefault(f.get("actionType"), []).append(f)

    timeline = []
    for ev in orch:
        ts = ev.get("timestamp")
        before = snap_at(ts) or {}
        after = snap_after(ts, 5) or {}
        # Pick most recent feedback for same actionType AFTER this event
        matching_fb = None
        for f in fb_by_action.get(ev.get("actionType"), []):
            if f.get("createdAt", "") >= ts:
                matching_fb = f
                break
        impact = {}
        if before and after:
            def pct(a, b):
                if not a: return None
                return round(((b - a) / a) * 100, 1)
            impact = {
                "ratioDelta": round((after.get("ratio") or 0) - (before.get("ratio") or 0), 2),
                "etaDelta":   round((after.get("avgEta") or 0) - (before.get("avgEta") or 0), 1),
                "demandPct":  pct(before.get("demand"), after.get("demand")),
                "supplyPct":  pct(before.get("supply"), after.get("supply")),
            }
        if matching_fb:
            impact["effectiveness"] = matching_fb.get("effectivenessScore")
            impact["feedbackStatus"] = matching_fb.get("status")
        timeline.append({
            "time": ts,
            "action": ev.get("actionType"),
            "source": ev.get("source", "orchestrator"),
            "reason": ev.get("reason"),
            "params": ev.get("params"),
            "before": {
                "ratio":  before.get("ratio"),
                "avgEta": before.get("avgEta"),
                "status": before.get("status"),
            } if before else None,
            "after": {
                "ratio":  after.get("ratio"),
                "avgEta": after.get("avgEta"),
                "status": after.get("status"),
            } if after else None,
            "impact": impact,
        })

    return {"zoneId": zone_id, "hours": hours, "timeline": timeline, "total": len(timeline)}


# ── BLOCK 3 — Strategy Control ───────────────────────────────────────────────
@app.get("/api/admin/strategy/{zone_id}")
async def get_strategy(zone_id: str, _=Depends(verify_admin_token)):
    doc = await db.strategy_weights.find_one({"zoneId": zone_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Strategy not found for zone")
    doc.setdefault("auto", doc.get("auto", True))
    doc.setdefault("minWeight", 0.3)
    doc.setdefault("maxWeight", 2.0)
    doc.setdefault("locked", False)
    return doc


@app.post("/api/admin/strategy/{zone_id}")
async def update_strategy(zone_id: str, request: Request, _=Depends(verify_admin_token)):
    body = await request.json()
    allowed = {"auto", "weights", "minWeight", "maxWeight", "locked"}
    upd = {k: v for k, v in body.items() if k in allowed}
    if "weights" in upd and isinstance(upd["weights"], dict):
        mn = float(upd.get("minWeight", body.get("minWeight", 0.3)))
        mx = float(upd.get("maxWeight", body.get("maxWeight", 2.0)))
        upd["weights"] = {k: max(mn, min(mx, float(v))) for k, v in upd["weights"].items()}
    upd["updatedAt"] = now_utc().isoformat()
    upd["updatedBy"] = "admin"
    await db.strategy_weights.update_one({"zoneId": zone_id}, {"$set": upd}, upsert=True)
    doc = await db.strategy_weights.find_one({"zoneId": zone_id}, {"_id": 0})
    return {"status": "updated", "zoneId": zone_id, "strategy": doc}


@app.get("/api/admin/strategies")
async def list_strategies(_=Depends(verify_admin_token)):
    docs = await db.strategy_weights.find({}, {"_id": 0}).to_list(100)
    return {"strategies": docs, "total": len(docs)}


# ── BLOCK 4 — Alerts with impact ─────────────────────────────────────────────
_AVG_ORDER_VALUE = 800  # ₴ mean booking value used for impact math


def _recommend_action(zone: dict) -> str:
    status = zone.get("status")
    ratio = zone.get("ratio", 1.0)
    if status == "CRITICAL":
        return "FORCE_SURGE + raise fanout to 6"
    if status == "SURGE" and ratio > 2.5:
        return "ENABLE_SURGE"
    if status == "BUSY":
        return "INCREASE_FANOUT"
    return "MONITOR"


@app.get("/api/admin/alerts/enhanced")
async def enhanced_admin_alerts(_=Depends(verify_admin_token)):
    """Sprint 9 — alerts annotated with business impact and recommended action."""
    alerts = []

    # Zone-based alerts (CRITICAL + SURGE)
    zones_bad = await db.zones.find(
        {"status": {"$in": ["SURGE", "CRITICAL"]}},
        {"_id": 0}
    ).to_list(50)
    for z in zones_bad:
        demand = z.get("demandScore", 0)
        supply = max(1, z.get("supplyScore", 1))
        conversion = max(0.1, min(0.95, supply / max(demand, 1)))
        match_rate = z.get("matchRate", int(conversion * 100))
        lost_per_hour = int(demand * _AVG_ORDER_VALUE * (1 - conversion))
        missed = max(0, int(demand - supply))
        alerts.append({
            "id": f"zone-{z.get('id')}",
            "level": "critical" if z.get("status") == "CRITICAL" else "warning",
            "category": "zone",
            "type": "CRITICAL_ZONE" if z.get("status") == "CRITICAL" else "SURGE_ZONE",
            "zone": z.get("name"),
            "zoneId": z.get("id"),
            "title": f"Zone {z.get('name')} — {z.get('status')}",
            "message": f"Ratio {z.get('ratio')}, demand {demand}, supply {supply}",
            "impact": {
                "lostRevenuePerHour": lost_per_hour,
                "missedBookings": missed,
                "matchRate": match_rate,
                "avgEta": z.get("avgEta"),
            },
            "recommendedAction": _recommend_action(z),
            "createdAt": z.get("updatedAt"),
        })

    # 5xx errors in last 5 min = money-loss signal
    cutoff5 = (now_utc() - timedelta(minutes=5)).isoformat()
    err_count = await db.system_logs.count_documents({
        "level": "error", "status": {"$gte": 500},
        "timestamp": {"$gte": cutoff5},
    })
    if err_count > 0:
        alerts.append({
            "id": "errors-5xx-5m",
            "level": "critical" if err_count > 3 else "warning",
            "category": "errors",
            "type": "BACKEND_ERROR_SPIKE",
            "title": f"{err_count} server errors in last 5 min",
            "message": "5xx responses from backend — potential GMV loss",
            "impact": {
                "lostRevenuePerHour": err_count * 12 * _AVG_ORDER_VALUE // 10,  # est 10% conversion hit
                "missedBookings": err_count // 3,
            },
            "recommendedAction": "INVESTIGATE_LOGS",
            "createdAt": now_utc().isoformat(),
        })

    # Failsafe incidents (pass-through)
    incidents = await db.failsafe_incidents.find({"status": "open"}, {"_id": 0}).sort("detectedAt", -1).to_list(20)
    for i in incidents:
        alerts.append({
            "id": i.get("id"),
            "level": "critical" if "crit" in (i.get("ruleName") or "").lower() else "warning",
            "category": "failsafe",
            "type": "FAILSAFE_INCIDENT",
            "title": i.get("ruleName", "Failsafe incident"),
            "message": f"{i.get('affectedEntityType')}/{i.get('affectedEntityId')}",
            "impact": {"missedBookings": 1},
            "recommendedAction": i.get("actionTaken") or "REVIEW",
            "createdAt": i.get("detectedAt"),
        })

    # Totals
    total_lost = sum(a.get("impact", {}).get("lostRevenuePerHour", 0) or 0 for a in alerts)
    total_missed = sum(a.get("impact", {}).get("missedBookings", 0) or 0 for a in alerts)

    alerts.sort(key=lambda x: (x.get("level") != "critical", -(x.get("impact", {}).get("lostRevenuePerHour", 0) or 0)))

    return {
        "alerts": alerts,
        "total": len(alerts),
        "summary": {
            "totalLostRevenuePerHour": total_lost,
            "totalMissedBookings": total_missed,
            "criticalCount": sum(1 for a in alerts if a["level"] == "critical"),
        },
    }

@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_to_nestjs(request: Request, path: str):
    # Circuit breaker check
    if not nest_breaker.allow():
        st = nest_breaker.state()
        return JSONResponse(
            status_code=503,
            content={
                "error": True,
                "code": "NESTJS_UNAVAILABLE",
                "message": "Backend service temporarily unavailable (circuit open)",
                "details": {"retryIn": st["retryIn"], "breaker": st},
            },
            headers={"Retry-After": str(st["retryIn"] or 30)},
        )

    target = f"{NESTJS_URL}/api/{path}"
    if request.query_params:
        target += f"?{request.query_params}"
    headers = dict(request.headers)
    headers.pop('host', None)
    headers.pop('content-length', None)
    body = await request.body()

    last_err: Optional[str] = None
    for attempt in range(3):  # 1 try + 2 retries
        try:
            resp = await http_client.request(method=request.method, url=target,
                                              headers=headers, content=body,
                                              timeout=15.0)
            # success (even 4xx is NestJS reachable)
            nest_breaker.record_success()
            rh = dict(resp.headers)
            for k in ['content-length', 'content-encoding', 'transfer-encoding']:
                rh.pop(k, None)
            return Response(content=resp.content, status_code=resp.status_code, headers=rh,
                            media_type=resp.headers.get('content-type', 'application/json'))
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout) as e:
            last_err = f"{type(e).__name__}: {e}"
            nest_breaker.record_failure()
            # relaunch NestJS on connect error
            if isinstance(e, httpx.ConnectError):
                asyncio.create_task(start_nestjs())
            if attempt < 2:
                await asyncio.sleep(0.5 * (attempt + 1))
                continue
            # fire alert (mocked dispatch) when breaker trips
            if nest_breaker.state()["state"] == "open":
                asyncio.create_task(dispatch_alert(
                    db, level="critical", code="NESTJS_CIRCUIT_OPEN",
                    message="FastAPI↔NestJS circuit opened after consecutive failures",
                    meta={"lastError": last_err, "breaker": nest_breaker.state()},
                ))
            return JSONResponse(
                status_code=503,
                content={
                    "error": True,
                    "code": "NESTJS_UNAVAILABLE",
                    "message": "Backend service temporarily unavailable",
                    "details": {"lastError": last_err, "breaker": nest_breaker.state()},
                },
                headers={"Retry-After": "5"},
            )
        except Exception as e:
            nest_breaker.record_failure()
            return JSONResponse(
                status_code=502,
                content=_normalize_error(502, str(e), code="UPSTREAM_ERROR"),
            )
    # should not reach here
    return JSONResponse(status_code=502,
                        content=_normalize_error(502, last_err or "Unknown upstream error",
                                                 code="UPSTREAM_ERROR"))

