# ERP TML - DASHBOARD AND GLOBAL UX PROMPT

## OBJETIVO

Implementar la experiencia global del ERP TML siguiendo estrictamente:

* MASTER_SYSTEM_PROMPT.md
* STOCK_ENGINE_PROMPT.md
* ARCHITECTURE_PROMPT.md
* DOMAIN_MODEL_PROMPT.md
* OPERATION_FLOWS_PROMPT.md
* MOVEMENTS_MODULE_PROMPT.md
* STOCK_MODULE_PROMPT.md
* WORKSHOPS_MODULE_PROMPT.md
* PDFS_AND_DOCUMENTS_PROMPT.md

No crear dashboards genéricos estilo administrativo tradicional.

---

# PRINCIPIO FUNDAMENTAL

El ERP TML es:

* operativo
* rápido
* mobile-first
* táctil
* orientado a acciones rápidas

NO debe sentirse como:

* SAP
* sistema contable pesado
* panel corporativo complejo

---

# OBJETIVO DEL MÓDULO

Implementar:

* dashboard operativo
* navegación global
* accesos rápidos
* alertas
* búsqueda rápida
* experiencia PWA completa
* diseño mobile-first

---

# EXPERIENCIA GENERAL

El usuario debe poder:

* abrir app
* entender situación
* ejecutar acción

en segundos.

---

# IMPLEMENTAR FRONTEND

---

# APP SHELL

Implementar:

* navegación persistente
* header móvil
* bottom navigation
* layouts reutilizables

---

# NAVEGACIÓN PRINCIPAL

Secciones:

* Inicio
* Movimientos
* Stock
* Talleres
* Reportes
* Configuración

---

# IMPORTANTE

En móvil:
usar bottom navigation.

---

# DASHBOARD PRINCIPAL

Debe mostrar:

* stock disponible
* pendientes talleres
* movimientos recientes
* alertas operativas
* accesos rápidos

---

# CARDS OPERATIVAS

Implementar:

## StockSummaryCard

Mostrar:

* disponible
* taller
* corte
* fallados

---

## WorkshopAlertCard

Mostrar:

* pendientes altos
* talleres atrasados

---

## RecentMovementsCard

Mostrar:

* últimos movimientos
* accesos rápidos

---

## QuickActionsCard

Botones grandes:

* Nueva entrega
* Nueva devolución
* Movimiento interno
* Nuevo egreso

---

# ALERTAS

Implementar alertas operativas:

* stock bajo
* pendientes elevados
* ajustes recientes

---

# BÚSQUEDA GLOBAL

Implementar búsqueda rápida:

* productos
* talleres
* movimientos

---

# UX MOBILE-FIRST

Priorizar:

* botones grandes
* navegación simple
* pocos clicks
* scroll natural
* inputs táctiles

---

# IMPORTANTE

Los usuarios trabajan:

* caminando
* desde teléfono
* rápido
* en depósitos

---

# PWA

Implementar correctamente:

* instalable
* iconos
* splash screen
* offline básico visual
* manifest
* service worker

---

# IMPORTANTE

Debe sentirse:
como app real.

---

# MODO OFFLINE

Preparar arquitectura para:

* cache básico
* reconexión futura

No implementar sincronización compleja todavía.

---

# LAYOUTS

Implementar:

* AuthLayout
* AppLayout
* MobileLayout

---

# COMPONENTES GLOBALES

Implementar:

* BottomNavigation
* AppHeader
* FloatingActionButton
* SearchBar
* AlertCard
* EmptyState
* LoadingState

---

# DARK MODE

Preparar arquitectura.

No priorizar todavía.

---

# PERFORMANCE

Optimizar:

* renders
* navegación
* carga inicial

---

# IMPORTANTE

El sistema debe abrir rápido incluso:

* en teléfonos modestos
* con mala conexión

---

# UX PRINCIPIOS

Siempre priorizar:

* simplicidad
* velocidad
* claridad
* operatividad

---

# NUNCA

* dashboards recargados
* gráficos innecesarios
* animaciones pesadas
* navegación compleja

---

# RESULTADO ESPERADO

Un ERP que se sienta:

* moderno
* extremadamente rápido
* operativo
* táctil
* simple
* natural para empleados TML
* listo para trabajo diario intensivo
