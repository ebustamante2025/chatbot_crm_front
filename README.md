# CRM WPS (Recreado)

Proyecto recreado desde cero con:
- Frontend: React + Vite + TypeScript
- Backend: Node + Express (MVC)
- Persistencia: `crm-data.json` (local)

## Funcionalidades
- Login local por rol (ASESOR / ADMIN / SUPERVISOR)
- Asesor: máximo 2 conversaciones activas simultáneas
- Si asesor no tiene tomadas: cola de disponibles ordenada por antigüedad
- Admin/Supervisor: ven todas las conversaciones
- Tomar caso cambia estado a `TOMADO_CASO`
- Envío y recepción WhatsApp Cloud API

## Usuarios de prueba
- `laura@wps.local` / `Admin12345` (ADMIN)
- `daniel@wps.local` / `Asesor12345` (ASESOR)
- `juan@wps.local` / `Asesor67890` (ASESOR)
- `camila@wps.local` / `Supervisor123` (SUPERVISOR)

## Variables de entorno
Copia `.env.example` a `.env`.

## Ejecutar
1. `npm install`
2. `npm run seed:local`
3. Terminal A: `npm run dev:api`
4. Terminal B: `npm run dev`
5. Abrir URL que muestre Vite (base 3005)

## Endpoints
- `POST /api/auth/login`
- `GET /api/conversations/feed?role=ASESOR&user_id=2`
- `GET /api/contacts`
- `GET /api/conversations/:phone`
- `POST /api/reply`
- `POST /api/conversations/:id/take`
- `PATCH /api/conversations/:id/status`
- `GET /api/users`
- `GET /webhook/whatsapp`
- `POST /webhook/whatsapp`
