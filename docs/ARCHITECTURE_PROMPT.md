# ERP TML - ARQUITECTURA TÉCNICA

## OBJETIVO

Definir la arquitectura oficial obligatoria del sistema ERP TML.

Todo el código nuevo debe respetar esta arquitectura.

Nunca improvisar estructuras nuevas fuera de estas reglas.

---

# ESTRUCTURA GENERAL

El proyecto estará dividido en:

* frontend
* backend
* shared
* docs

---

# FRONTEND

Tecnologías:

* React
* TypeScript
* Vite
* Tailwind
* PWA

El frontend será:

* mobile-first
* rápido
* modular
* orientado a operaciones rápidas

---

# BACKEND

Tecnologías:

* Express
* TypeScript
* Prisma
* PostgreSQL

El backend será:

* modular
* tipado
* desacoplado
* transaccional

---

# REGLA FUNDAMENTAL

La lógica crítica NO debe existir en frontend.

Toda lógica de:

* stock
* movimientos
* saldos
* talleres
* permisos
* validaciones

debe existir en backend.

---

# ESTRUCTURA BACKEND

src/backend/

* routes/
* controllers/
* services/
* repositories/
* middlewares/
* validators/
* db/
* utils/
* types/
* scripts/

---

# RESPONSABILIDADES

## ROUTES

Solo:

* definir endpoints
* aplicar middlewares

Nunca:

* lógica de negocio

---

## CONTROLLERS

Solo:

* recibir request
* validar input básico
* llamar services
* responder

Nunca:

* lógica pesada
* queries Prisma complejas

---

## SERVICES

Aquí vive:

* lógica real
* reglas de negocio
* movimientos
* validaciones críticas
* stock engine

---

## REPOSITORIES

Encapsulan:

* Prisma
* queries
* acceso DB

Nunca usar Prisma directo fuera repositories/services críticos.

---

## MIDDLEWARES

Ejemplos:

* auth
* permisos
* auditoría
* errores

---

# TRANSACCIONES

Toda operación crítica debe usar transacciones.

Especialmente:

* movimientos
* devoluciones
* entregas
* reconversiones
* ajustes

---

# AUDITORÍA

Toda modificación importante debe registrar:

* usuario
* fecha
* acción
* observaciones

---

# FRONTEND ESTRUCTURA

src/frontend/

* app/
* components/
* modules/
* hooks/
* services/
* store/
* layouts/
* pages/
* utils/
* types/

---

# MÓDULOS FRONTEND

Cada módulo tendrá:

* components
* pages
* hooks
* services
* types

Ejemplo:

modules/stock/
modules/talleres/
modules/reportes/

---

# REGLAS FRONTEND

## NO

* lógica compleja en componentes
* requests repetidos
* estados duplicados
* formularios gigantes

---

# SI

* componentes pequeños
* hooks reutilizables
* loading states
* optimistic UI cuando aplique

---

# PWA

El ERP será instalable.

Debe:

* funcionar como app
* tener iconos
* splash screen
* navegación rápida

---

# AUTH

Sistema privado.

Usar:

* JWT
* cookies httpOnly

Nunca:

* guardar tokens en localStorage

---

# PERMISOS

Permisos dinámicos.

Nunca hardcodear roles.

---

# VALIDACIONES

Backend:

* obligatorio

Frontend:

* UX solamente

Nunca confiar únicamente en frontend.

---

# STOCK ENGINE

Toda modificación de stock debe pasar por:

services/stock/

Nunca alterar stock desde controllers.

---

# PDFS

Los PDFs deben generarse desde backend.

Ejemplos:

* remitos
* entregas
* pagos talleres

---

# ESTILO DE CÓDIGO

Siempre:

* TypeScript estricto
* nombres claros
* funciones pequeñas
* código legible

Nunca:

* archivos gigantes
* lógica duplicada
* any innecesario

---

# PERFORMANCE

Priorizar:

* velocidad operativa
* rapidez móvil
* simplicidad

Evitar:

* renders innecesarios
* queries excesivas
* overengineering

---

# PRINCIPIO FINAL

Este ERP debe poder crecer durante años sin romperse.

Toda implementación debe priorizar:

* mantenibilidad
* consistencia
* estabilidad
* trazabilidad
