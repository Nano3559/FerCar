# Guía de despliegue (producción)

El sistema tiene 3 piezas:

| Pieza | Tecnología | Dónde se publica |
|---|---|---|
| Base de datos | PostgreSQL | Neon (gratis) |
| Backend (API) | Express + Prisma | Render.com (Web Service) |
| Frontend (web) | React + Vite | Vercel (proyecto SPA) |

> Por qué Render y no Vercel para el backend: el backend guarda archivos subidos (Excel de notas de compra, facturas) en disco y ejecuta un job diario de reposición. En serverless de Vercel los archivos se pierden y el job no corre. En Render el servicio está siempre encendido.

---

## Paso 1 — Crear la base de datos en Neon

1. Entra en https://neon.tech → créate una cuenta (o entra con Google/GitHub).
2. **Create a project** → elige una región (ej. US East) → déjalo con la base por defecto o nómbrala `inventario_db`.
3. Copia el **connection string** que te muestran:
   ```
   postgresql://usuario:password@ep-xxxx.us-east-2.aws.neon.tech/inventario_db?sslmode=require
   ```
   Guárdalo, lo usarás en los pasos 2 y 3.

## Paso 2 — Crear las tablas y los datos de prueba (desde tu PC)

Con el repo ya clonado/actualizado, abre PowerShell en `backend` y ejecuta:

```powershell
.\scripts\deploy-db.ps1 "postgresql://usuario:password@ep-xxxx.us-east-2.aws.neon.tech/inventario_db?sslmode=require"
```

Esto aplica **todas las migraciones** en orden y **siembra** roles, admin, productos, ubicaciones e inventario de prueba.

- Usuario admin: `admin@inventario.com` — contraseña: `admin123`

## Paso 3 — Publicar el backend en Render

1. Sube este repositorio a GitHub.
2. Entra en https://render.com → **New → Web Service** → conecta tu repo.
3. El archivo [`render.yaml`](./render.yaml) ya está preparado (root `backend`, build y start configurados). Si usas el **Blueprint**, se autoconfigura solo.
4. Asigna las variables de entorno (en Render → tu servicio → **Environment**):

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | el connection string de Neon (paso 1) |
   | `JWT_SECRET` | una clave larga y aleatoria (30+ caracteres) — si queda `secret-key` la API no arranca |
   | `FRONTEND_URL` | `https://el-nombre-de-tu-frontend.vercel.app` (paso 4) |
   | `MOBILE_URL` | `http://localhost:19006` (no usado en web) |

5. **Deploy**. Render te da una URL tipo `https://inventario-backend.onrender.com`.
6. Verifica que funcione abriendo `https://inventario-backend.onrender.com/api/health` → debe responder `{"status":"ok",...}`.

## Paso 4 — Publicar el frontend en Vercel

1. Entra en https://vercel.com → **Add New Project** → importa tu repo.
2. En **Root Directory** selecciona la carpeta **`frontend`** (ya tiene su `vercel.json`).
3. En **Environment Variables** agrega:

   | Variable | Valor |
   |---|---|
   | `VITE_API_URL` | `https://inventario-backend.onrender.com/api` (tu URL de Render) |

4. **Deploy**. Vercel te da una URL tipo `https://inventario.vercel.app`.

## Paso 5 — Probar el sistema en producción

- Abre la URL de Vercel y entra con `admin@inventario.com` / `admin123`.
- Pruebas recomendadas:
  - **Ventas**: registrar una venta → el stock de la tienda decrece al instante.
  - **Notas de Compra**: subir un Excel → se crea la nota, suma stock y recalcula precios.
  - **Conciliación**: compras − ventas vs stock real, filtrable por nota.
- Pasa la URL de Vercel (y la de Render si es necesario) a tus probadores.

---

## Notas y límites

- **Archivos subidos**: Render conserva los archivos mientras el servicio esté activo. En planes gratuitos de Render el servicio se duerme a los 15 min de inactividad (se despierta con la siguiente petición).
- **Job de reposición**: corre al iniciar el servicio (horario configurado).
- **Migrations**: el proyecto usa archivos SQL manuales. El script `deploy-db.ps1` los aplica en orden; no uses `prisma migrate` para esto.
- **Seguridad**: nunca subas `backend/.env` ni `frontend/.env.local` a GitHub (ya están en `.gitignore`).