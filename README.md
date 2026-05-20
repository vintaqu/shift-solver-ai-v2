<div align="center">

<img src="https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js" />
<img src="https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript" />
<img src="https://img.shields.io/badge/Prisma-5-2D3748?style=for-the-badge&logo=prisma" />
<img src="https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql" />
<img src="https://img.shields.io/badge/OR--Tools-CP--SAT-FF6F00?style=for-the-badge&logo=google" />

<br />
<br />

# ✦ Shift Solver AI

### Planificación inteligente de turnos para hostelería

*Del Excel al cuadrante optimizado — en 60 segundos.*

<br />

[🚀 Demo en vivo](https://shiftsolver.vercel.app) · [📖 Documentación](#documentación) · [🐛 Reportar issue](https://github.com/tu-usuario/shift-solver-ai/issues)

</div>

---

## ¿Qué es Shift Solver AI?

Shift Solver AI es una plataforma **SaaS B2B** diseñada para managers y propietarios de restaurantes que dedican horas cada semana a hacer el cuadrante de turnos a mano.

El sistema genera automáticamente el horario semanal usando **OR-Tools CP-SAT** — el motor de optimización combinatoria de Google — respetando contratos individuales, restricciones legales del convenio colectivo y las necesidades de cobertura del negocio.

```
❌ Antes:  3-4 horas cada semana mirando un Excel
✅ Ahora:  60 segundos · óptimo · sin errores legales
```

---

## Capturas

| Planificador semanal | Dashboard | Portal empleado |
|---|---|---|
| Cuadrante drag & drop con generación IA | Métricas en tiempo real | Acceso por PIN desde móvil |

---

## Características principales

### 🤖 Generación automática con IA
El solver OR-Tools CP-SAT resuelve ~2.900 variables en 15–90 segundos. Considera contratos, restricciones individuales, descansos obligatorios, roles requeridos y cobertura por franja de 30 minutos.

### ⚖️ Cumplimiento legal automático
Motor de validación con referencias exactas al articulado legal:
- Estatuto de los Trabajadores (Art. 34, 35, 36, 37, 38)
- Convenio Hostelería Tarragona
- Convenio Estatal de Hostelería
- Configurable por organización y por empleado

### 👤 Multi-tenant seguro
Cada restaurante tiene su propio espacio completamente aislado. Un empleado de un restaurante nunca puede ver datos de otro.

### 📱 Portal de empleado por PIN
Cada restaurante tiene su URL única (`/r/mi-restaurante/login`). Los empleados acceden con un PIN de 4-6 dígitos desde su móvil. Sin contraseñas. Sin apps que instalar.

### 📊 Panel anual de cumplimiento
Seguimiento de horas anuales por empleado con semáforo de riesgo legal, proyección de fin de año, saldo de vacaciones y alertas de exceso de horas extra.

### 🗓️ Plantillas de cobertura por temporada
Define configuraciones distintas para verano, invierno o eventos especiales. Actívalas manualmente o con vigencia anual automática.

### 📥 Exportación Excel profesional
Cuadrante semanal en formato visual con colores de empleado, horas brutas/netas, descansos y resumen por empleado. Listo para imprimir o enviar a la gestoría.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (Next.js 14)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │Dashboard │  │Planific. │  │Empleados │  │Portal emp. │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    SERVER ACTIONS / API                       │
│  auth · planning · employees · absences · coverage · export  │
├──────────────────────────┬──────────────────────────────────┤
│      PRISMA ORM           │         OR-TOOLS API              │
│      PostgreSQL           │    Railway · Python · CP-SAT      │
└──────────────────────────┴──────────────────────────────────┘
```

### Estructura del repositorio

```
src/
├── app/
│   ├── (auth)/              # Login email+contraseña
│   ├── (dashboard)/         # Panel manager/owner
│   │   ├── dashboard/       # Métricas y alertas
│   │   ├── planning/        # Cuadrantes semana/mes/año
│   │   ├── employees/       # Gestión de empleados
│   │   ├── coverage/        # Necesidades de cobertura
│   │   ├── absences/        # Vacaciones y ausencias
│   │   └── settings/        # Ajustes organización
│   ├── admin/               # Panel Super Admin
│   ├── portal/              # Portal del empleado
│   ├── r/[slug]/            # Login por PIN del restaurante
│   └── api/                 # API routes (export, auth)
├── components/              # Componentes React por módulo
├── lib/
│   ├── auth.ts              # Auth.js bcrypt + PIN provider
│   ├── prisma.ts            # Cliente Prisma
│   ├── scheduler/           # Cliente OR-Tools + mapper
│   ├── exportWeekly.ts      # Generador Excel (ExcelJS)
│   ├── legalFrameworks.ts   # Marcos legales preconfigurados
│   └── session.ts           # Helpers de sesión y org context
├── server/actions/          # Server Actions de Next.js
└── types/                   # TypeScript types compartidos
prisma/
├── schema.prisma            # Modelo de datos completo
└── seed.ts                  # Datos de demostración
```

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14 (App Router) |
| Lenguaje | TypeScript 5 |
| Base de datos | PostgreSQL 16 |
| ORM | Prisma 5 |
| Autenticación | Auth.js v5 (bcrypt) |
| Solver IA | OR-Tools CP-SAT (Python, Railway) |
| Estilos | Tailwind CSS |
| Notificaciones | Sonner |
| Exportación | ExcelJS |
| Deploy app | Vercel |
| Deploy solver | Railway |

---

## Roles de usuario

| Rol | Acceso | Autenticación |
|---|---|---|
| `SUPER_ADMIN` | Toda la plataforma · todas las organizaciones | Email + contraseña |
| `ORG_OWNER` | Su organización completa incluyendo facturación | Email + contraseña |
| `MANAGER` | Cuadrantes, empleados, ausencias (sin costes) | Email + contraseña |
| `EMPLOYEE` | Solo su portal personal (turnos + solicitudes) | PIN numérico |

---

## Instalación local

### Requisitos previos

- Node.js 18+
- PostgreSQL 14+
- npm o pnpm

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/shift-solver-ai.git
cd shift-solver-ai

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus valores

# 4. Aplicar el schema de base de datos
npm run db:push

# 5. Poblar con datos de demostración
npm run db:seed

# 6. Arrancar en desarrollo
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

---

## Variables de entorno

Copia `.env.example` como `.env.local` y rellena los valores:

```bash
# Base de datos
DATABASE_URL="postgresql://user:password@localhost:5432/shift_solver_db"

# Auth.js — genera con: openssl rand -base64 32
AUTH_SECRET="tu-secret-de-32-caracteres-minimo"
AUTH_URL="http://localhost:3000"

# Solver OR-Tools (Railway)
SOLVER_API_URL="https://shift-solver-ai-production.up.railway.app"
SOLVER_API_KEY="tu-api-key"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="Shift Solver AI"
```

---

## Credenciales de demostración

Tras ejecutar `npm run db:seed`:

| Rol | Email | Contraseña |
|---|---|---|
| Super Admin | superadmin@shiftsolver.com | SuperAdmin123! |
| Owner demo | admin@shiftsolver.com | Demo1234! |

**Portal de empleados:**
```
URL:  http://localhost:3000/r/restaurante-demo/login
PIN:  1234  (todos los empleados demo)
```

---

## Scripts disponibles

```bash
npm run dev          # Servidor de desarrollo
npm run build        # Build de producción
npm run start        # Servidor de producción
npm run lint         # Linting con ESLint
npm run db:push      # Aplicar schema a la BD
npm run db:seed      # Poblar con datos de demo
npm run db:studio    # Abrir Prisma Studio (explorador BD)
```

---

## Deploy en Vercel

### 1. Base de datos

Recomendamos **Neon** (gratis en el tier inicial) o **Vercel Postgres**:

```bash
# Neon: crear BD en neon.tech y copiar la connection string
DATABASE_URL="postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require"
```

### 2. Variables en Vercel

En el panel de Vercel → Settings → Environment Variables:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Connection string PostgreSQL con `?sslmode=require` |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | URL de tu app en Vercel |
| `SOLVER_API_URL` | URL del solver en Railway |
| `SOLVER_API_KEY` | API key del solver |
| `NEXT_PUBLIC_APP_URL` | URL pública de la app |

### 3. Post-deploy

```bash
# Apuntar a la BD de producción y ejecutar:
npx prisma db push
npm run db:seed
```

---

## Seguridad

- ✅ Contraseñas hasheadas con bcrypt (factor 12)
- ✅ PINs de empleados hasheados con bcrypt (factor 10)
- ✅ Aislamiento multi-tenant por `organizationId` en todas las queries
- ✅ Middleware de routing basado en roles
- ✅ Verificación de pertenencia en rutas con parámetros dinámicos (`/planning/week/[id]`, `/employees/[id]`)
- ✅ API key del solver solo en el servidor (nunca expuesta al cliente)
- ✅ Security headers: `X-Frame-Options`, `X-Content-Type-Options`, `HSTS`, `Referrer-Policy`
- ✅ `poweredByHeader: false`
- ✅ Server Actions protegidas con verificación de sesión y organización

---

## Módulos implementados

| Módulo | Estado |
|---|---|
| Planificador semanal (drag & drop) | ✅ Completo |
| Generación IA con OR-Tools | ✅ Completo |
| Calendario mensual | ✅ Completo |
| Panel anual de cumplimiento | ✅ Completo |
| CRUD empleados (5 tabs) | ✅ Completo |
| Cobertura con plantillas por temporada | ✅ Completo |
| Ausencias y vacaciones | ✅ Completo |
| Dashboard con métricas reales | ✅ Completo |
| Portal empleado (PIN) | ✅ Completo |
| Autenticación multi-rol | ✅ Completo |
| Multi-tenant + onboarding | ✅ Completo |
| Marcos legales configurables | ✅ Completo |
| Exportación Excel semanal | ✅ Completo |
| Panel Super Admin | ✅ Completo |
| Landing page de venta | ✅ Completo |
| Notificaciones | 🔲 Pendiente |
| Control horario / fichaje | 🔲 Pendiente |
| Billing / suscripciones | 🔲 Pendiente |

---

## Licencia

Proyecto privado — todos los derechos reservados.

---

<div align="center">

Hecho con ☕ para el sector de la hostelería española

</div>
