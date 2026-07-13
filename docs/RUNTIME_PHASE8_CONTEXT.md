# ERP TML — MASTER RUNTIME CONTEXT + FASE 8

## CONTEXTO GENERAL DEL PROYECTO

Este proyecto NO es una app SaaS tradicional.

Es un ERP operacional industrial para Textil María Luisa (TML), utilizado por operarios reales en:

* depósitos
* talleres
* producción
* logística
* apertura de fardos
* movimientos internos

El sistema será usado:

* durante jornadas completas
* en Android baratos
* con mala conexión
* con WiFi inestable
* bajo presión operativa
* con miles de movimientos
* en ambientes industriales reales

La prioridad absoluta NO es estética.

La prioridad es:

1. estabilidad
2. velocidad percibida
3. resiliencia offline
4. UX operacional
5. tolerancia a fallos
6. bajo consumo de memoria
7. render fluido
8. simplicidad robusta

---

# FILOSOFÍA ARQUITECTÓNICA

NO queremos:

* arquitectura enterprise inflada
* overengineering
* patrones abstractos innecesarios
* render complejos
* virtualización pesada
* animaciones excesivas
* UI SaaS moderna genérica
* dependencias gigantes

Queremos:

* runtime simple y robusto
* mobile-first extremo
* offline-first real
* componentes táctiles
* memoria estable
* recovery automático
* sincronización resiliente
* rendering incremental
* stores pequeñas y optimizadas

---

# STACK ACTUAL

## Backend

* Node.js
* Express
* Prisma
* PostgreSQL / Neon
* DTOs versionados
* optimistic locking
* sync API offline-first
* PDF modular
* métricas internas
* export streams CSV
* repositorios desacoplados

## Frontend / PWA

* React
* Vite
* TypeScript
* Zustand
* Dexie
* Workbox
* IndexedDB
* React Router

---

# FASES YA IMPLEMENTADAS

## Fase 5

* arquitectura backend desacoplada
* optimistic locking
* retries transaccionales
* métricas
* PDFs modulares
* timeline cursor pagination

## Fase 6

* DTO versionados
* sync offline API
* replay protection
* payload hashing
* observabilidad
* alertas stock
* export incremental

## Fase 7

* arquitectura PWA
* Dexie persistence
* offline queue
* sync engine
* service worker inicial
* SPA fallback
* timeline mobile
* conflict resolution UI
* numeric pad operacional
* sync drawer
* offline lifecycle base

---

# OBJETIVO ACTUAL

Entramos en:

# FASE 8

## Runtime Industrial + Performance + Offline Reliability

La prioridad absoluta ahora es:

* performance extrema
* estabilidad runtime
* resiliencia offline
* UX operacional
* Android gama baja
* memoria baja
* render estable

---

# RESTRICCIONES OBLIGATORIAS

## PERFORMANCE

Optimizar para:

* Android baratos
* poca RAM
* CPUs lentas
* conexiones malas

Minimizar:

* renders
* repaints
* hydration
* garbage collection
* layout shifts
* memory churn

---

# OFFLINE-FIRST REAL

La app DEBE funcionar:

* sin internet
* con reconexiones constantes
* post-crash
* post-refresh
* post-reinicio

NO se pueden perder movimientos.

---

# SERVICE WORKER

Usar estrategias reales:

## API crítica

network-first

## catálogos

stale-while-revalidate

## assets

cache-first

## imágenes

cache limitada con expiración

Implementar:

* cleanup automático
* invalidación inteligente
* versionado
* background sync
* offline fallback
* SW corruption recovery

---

# UX OPERACIONAL

NO diseñar UI tipo dashboard SaaS.

Diseñar:

* botones grandes
* targets táctiles enormes
* navegación mínima
* feedback instantáneo
* 1–2 taps por operación
* contraste alto
* usable con una mano

---

# TIMELINE

Debe soportar:

* decenas de miles de movimientos
* render incremental
* slices
* batching
* prefetch inteligente
* indexed Dexie queries

NO usar:

* react-window
* react-virtualized

Implementar estrategia propia ultra liviana.

---

# OBSERVABILIDAD

Implementar métricas:

* startup time
* hydration
* render duration
* queue size
* sync duration
* failed syncs
* offline duration
* cache hit ratio
* memory pressure

---

# ERROR RECOVERY

La app JAMÁS debe quedar inutilizable.

Implementar:

* error boundaries
* degraded mode
* retry UX
* reconnect UX
* safe mode
* fallback screens
* auto recovery

---

# DECISIONES ARQUITECTÓNICAS IMPORTANTES

## Rendering

Priorizar:

* lazy rendering
* suspense boundaries
* memoization correcta
* store slicing
* selectors optimizados
* render batching

## Offline Engine

Implementar:

* retry persistente
* exponential backoff
* jitter
* dead-letter queue
* replay protection
* checksum validation
* sync resume

## Estados Sync

* pending
* syncing
* synced
* failed
* conflict
* retry_scheduled

---

# IMPORTANTE

NO generar:

* código ornamental
* abstracciones innecesarias
* hooks gigantes multipropósito
* providers anidados excesivos
* stores globales monstruosas

Priorizar:

* simplicidad robusta
* performance real
* mantenibilidad
* estabilidad operacional

---

# INSTRUCCIÓN ACTUAL

Comenzar inmediatamente por:

# FASE 8A

## Runtime Foundation + Offline Hardening

Antes de implementar:

1. redefinir runtime architecture
2. definir rendering lifecycle
3. definir sync lifecycle
4. definir cache lifecycle
5. definir offline lifecycle
6. definir store architecture

Y recién después implementar.

Todo debe ser production-grade y alineado con esta filosofía.
