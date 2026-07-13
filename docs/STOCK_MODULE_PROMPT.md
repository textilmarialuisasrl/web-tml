# ERP TML - STOCK MODULE PROMPT

## OBJETIVO

Implementar el módulo visual y operativo de stock del ERP TML siguiendo estrictamente:

* MASTER_SYSTEM_PROMPT.md
* STOCK_ENGINE_PROMPT.md
* ARCHITECTURE_PROMPT.md
* DOMAIN_MODEL_PROMPT.md
* OPERATION_FLOWS_PROMPT.md
* MOVEMENTS_MODULE_PROMPT.md

No implementar lógica paralela al motor de movimientos.

---

# PRINCIPIO FUNDAMENTAL

El módulo stock NO modifica stock directamente.

El stock:

* se deriva desde movimientos
* se consulta desde StockActual
* se visualiza operacionalmente

---

# OBJETIVO DEL MÓDULO

Permitir visualizar rápidamente:

* stock disponible
* stock en taller
* stock zona corte
* stock fallado
* stock minorista
* stock sin etiqueta
* stock por depósito
* stock global
* stock por producto

---

# IMPORTANTE

El sistema debe sentirse:

* extremadamente rápido
* operativo
* mobile-first

---

# IMPLEMENTAR BACKEND

---

# RUTAS

Crear:

/api/stock

---

# ENDPOINTS

## GET /api/stock

Debe permitir filtros:

* producto
* depósito
* estado
* calidad
* categoría

---

## GET /api/stock/summary

Debe devolver:

* total disponible
* total taller
* total corte
* total fallado
* total minorista

---

## GET /api/stock/product/:id

Debe devolver:

* stock total
* stock por depósito
* stock por estado
* stock por calidad

---

## GET /api/stock/workshops

Debe devolver:

* pendientes por taller
* productos pendientes
* cantidades pendientes

---

# IMPORTANTE

Nunca calcular stock complejo en frontend.

Todo cálculo crítico:
backend.

---

# IMPLEMENTAR SERVICES

Crear:

src/backend/services/stock/

---

# IMPLEMENTAR

## getCurrentStock()

Consulta stock consolidado.

---

## getProductStockDetail()

Detalle completo producto.

---

## getWorkshopPendingStock()

Pendientes talleres.

---

## getStockSummary()

Resumen operativo.

---

# CONVERSIONES

Implementar helper reutilizable:

* unidades
* docenas
* fardos

---

# REGLA CRÍTICA

Internamente:
TODO en unidades simples.

Visualmente:
convertible.

---

# FRONTEND

Crear módulo:

src/frontend/modules/stock/

---

# PANTALLAS

Implementar:

## Stock general

Mostrar:

* productos
* cantidades
* depósitos
* estados

---

## Detalle producto

Mostrar:

* stock total
* depósitos
* taller
* fallados
* minorista
* sin etiqueta

---

## Stock talleres

Mostrar:

* taller
* pendientes
* entregado
* devuelto

---

# UX MOBILE-FIRST

Priorizar:

* cards
* acordeones
* tabs simples
* búsqueda rápida

---

# IMPORTANTE

NO usar tablas gigantes desktop.

---

# COMPONENTES IMPORTANTES

Implementar:

* StockCard
* ProductStockCard
* StockStateBadge
* UnitDisplay
* StockSummaryCard
* WorkshopPendingCard

---

# VISUALIZACIÓN DE UNIDADES

El usuario debe poder alternar:

* unidades
* docenas
* fardos

desde cualquier pantalla.

---

# IMPORTANTE

La preferencia de visualización:

* debe persistir
* localmente

---

# FILTROS

Implementar filtros rápidos:

* depósito
* categoría
* estado
* calidad

---

# BÚSQUEDA

Implementar búsqueda rápida por:

* nombre producto
* categoría

---

# PERFORMANCE

Optimizar:

* queries
* renders
* filtros

---

# IMPORTANTE

StockActual debe usarse para:

* consultas rápidas

NO recalcular historial completo constantemente.

---

# UX OPERATIVA

El stock debe entenderse de un vistazo.

Priorizar:

* claridad
* velocidad
* simplicidad

---

# NUNCA

* dashboards complejos
* gráficos innecesarios
* tablas enormes mobile

---

# RESULTADO ESPERADO

Un módulo de stock:

* rápido
* claro
* mobile-first
* operativo
* consistente con movimientos
* consistente con talleres
* consistente con TML real
