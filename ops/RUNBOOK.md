# RUNBOOK — когда что запускать

## 🚀 После свежего клона / нового pod'а
```bash
bash /app/ops/bootstrap.sh
```
Устанавливает все depsы (pip / npm / yarn), собирает `admin/dist`, `web-app/dist`, `backend/dist`, запускает supervisor, дожидается health.

## ⚡ Обычный запуск (всё уже установлено)
```bash
bash /app/ops/start.sh
```

## 🛑 Остановить всё
```bash
bash /app/ops/stop.sh
```

## 🔄 Перезапуск
```bash
bash /app/ops/restart.sh           # всё
bash /app/ops/restart.sh backend   # только FastAPI+NestJS
bash /app/ops/restart.sh expo      # только mobile
```

## 🏗 Сборка отдельных частей
```bash
bash /app/ops/build.sh admin     # admin/dist  (Vite)
bash /app/ops/build.sh web       # web-app/dist (Vite)
bash /app/ops/build.sh nest      # backend/dist (NestJS)
bash /app/ops/build.sh all       # всё выше
```
Mobile (Expo) не требует сборки — Metro бандлит в рантайме.

## 🔍 Проверки
```bash
bash /app/ops/health.sh          # HTTP 200 для всех 4 URL + Orchestrator cycles
bash /app/ops/split-check.sh     # Проверка что frontend/admin/web-app не импортят друг друга
bash /app/ops/logs.sh            # tail -f всех supervisor логов
bash /app/ops/logs.sh backend    # только backend
```

## 💾 База данных
```bash
bash /app/ops/db-backup.sh                    # → /app/backups/<ts>.tar.gz
bash /app/ops/db-restore.sh <path>.tar.gz     # восстановление
bash /app/ops/db-seed.sh                      # перенакатить seed (restart FastAPI)
bash /app/ops/db-reset.sh                     # drop DB + re-seed (ВНИМАНИЕ: удаляет всё)
```

## 🗂 Структура каталогов

```
/app
├── backend/         # 🐍 FastAPI (:8001) + 🟩 NestJS compiled (:3001)
│   ├── server.py    # FastAPI proxy + Phase E/G/H + seed
│   ├── src/         # NestJS TypeScript source (31 модуль)
│   └── dist/        # npx nest build output (main.js)
├── frontend/        # 📱 MOBILE EXPO — ТОЛЬКО mobile app
│   ├── app/         # expo-router (46 screens)
│   └── src/         # contexts, components, services (только для mobile)
├── admin/           # 🛠 ADMIN PANEL — ТОЛЬКО админка  
│   ├── src/         # React + Vite source (57 страниц)
│   └── dist/        # npm run build output
├── web-app/         # 🌐 WEB MARKETPLACE — ТОЛЬКО публичный сайт
│   ├── src/         # React + Vite source
│   └── dist/        # npm run build output
├── ops/             # Все operational скрипты (этот файл)
├── memory/          # PRD.md, test_credentials.md
└── backups/         # mongodump snapshots
```

## 🔐 Правило изоляции (важно!)

**НИКОГДА** не импортить код между `frontend/`, `admin/`, `web-app/`. Каждый имеет свой `package.json`, `node_modules`, и build-пайплайн. Общие бизнес-правила — только через REST API (`/api/*`) к backend.

`bash /app/ops/split-check.sh` проверит это автоматически.

## 🚨 Troubleshooting

| Симптом | Фикс |
|---------|------|
| 503 на `/api/organizations` | NestJS ещё не скомпилирован или не стартовал. `bash /app/ops/build.sh nest && bash /app/ops/restart.sh backend` |
| 404 на `/api/admin-panel/` | Админка не собрана. `bash /app/ops/build.sh admin` |
| 404 на `/api/web-app/` | Веб не собран. `bash /app/ops/build.sh web` |
| Mobile white screen | `sudo supervisorctl restart expo` + подождать 25 с бандла |
| `Backend starting, please retry` | NestJS рестартует — подожди 10 с |
| MongoDB недоступен | `sudo supervisorctl start mongodb` |
