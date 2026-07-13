# ERP TML - WORKSHOPS MODULE PROMPT

## OBJETIVO

Implementar el módulo de talleres del ERP TML siguiendo estrictamente:

* MASTER_SYSTEM_PROMPT.md
* STOCK_ENGINE_PROMPT.md
* ARCHITECTURE_PROMPT.md
* DOMAIN_MODEL_PROMPT.md
* OPERATION_FLOWS_PROMPT.md
* MOVEMENTS_MODULE_PROMPT.md
* STOCK_MODULE_PROMPT.md

No duplicar lógica de movimientos ni stock.

---

# PRINCIPIO FUNDAMENTAL

Los talleres NO manejan stock independiente.

El sistema maneja:

* entregas
* devoluciones
* saldos pendientes

calculados desde movimientos.

---

# OBJETIVO DEL MÓDULO

Permitir:

* visualizar talleres
* visualizar pendientes
* visualizar historial
* visualizar producción
* registrar productividad
* generar pagos
* generar PDFs de pago

---

# IMPORTANTE

Todo debe derivarse desde movimientos reales.

Nunca duplicar estados.

---

# IMPLEMENTAR BACKEND

---

# RUTAS

/api/workshops

---

# ENDPOINTS

## GET /api/workshops

Lista talleres.

---

## GET /api/workshops/:id

Detalle completo taller.

---

## GET /api/workshops/:id/pending

Debe devolver:

* productos pendientes
* entregado
* devuelto
* saldo pendiente

---

## GET /api/workshops/:id/history

Historial movimientos.

---

## GET /api/workshops/:id/production

Producción por período.

---

## GET /api/workshops/:id/payments-preview

Vista previa pagos.

---

# IMPORTANTE

Todos los cálculos:
backend.

---

# IMPLEMENTAR SERVICES

Crear:

src/backend/services/workshops/

---

# IMPLEMENTAR

## getWorkshopPendingBalance()

Debe calcular:

* entregado
* devuelto
* pendiente

por producto.

---

## getWorkshopProduction()

Debe devolver:

* total producido
* agrupado por producto
* agrupado por período

---

## getWorkshopPaymentPreview()

Debe:

* calcular por fardos
* usar reglas taller
* agrupar producción

---

# IMPORTANTE

Los pagos:
NO son por unidades.

Son:

* por fardos producidos

---

# REGLA DE NEGOCIO

Cada taller tiene:

* tipo costura
* precio trapo
* precio rejilla

El valor:
NO cambia por tamaño.

---

# EJEMPLO

Trapo:

* grande
* mediano
* chico

pagan igual.

---

# IMPORTANTE

El precio depende:

* del taller
* del tipo producto

NO del tamaño.

---

# IMPLEMENTAR FRONTEND

Crear módulo:

src/frontend/modules/workshops/

---

# PANTALLAS

## Lista talleres

Mostrar:

* pendientes
* producción reciente
* estado

---

## Detalle taller

Mostrar:

* pendientes
* historial
* entregas
* devoluciones
* productividad
* pagos

---

## Producción taller

Mostrar:

* productos
* cantidades
* fardos equivalentes

---

## Vista previa pago

Mostrar:

* período
* productos
* fardos
* subtotal
* total

---

# UX MOBILE-FIRST

Priorizar:

* cards
* tabs simples
* resumen rápido
* navegación rápida

---

# COMPONENTES IMPORTANTES

Implementar:

* WorkshopCard
* PendingBalanceCard
* ProductionSummaryCard
* PaymentPreviewCard
* WorkshopMovementList

---

# CONVERSIONES

Visualizar:

* unidades
* docenas
* fardos

pero:
internamente siempre unidades.

---

# PDFS

Preparar arquitectura para:

## PDF pago taller

Debe incluir:

* período
* detalle producción
* cantidades
* equivalencias fardos
* total pago

---

# IMPORTANTE

El PDF debe parecer:

* remito operativo
* simple
* imprimible

---

# HISTORIAL

Permitir visualizar:

* entregas
* devoluciones
* ajustes
* reconversiones

---

# PERFORMANCE

Optimizar:

* consultas pendientes
* agrupaciones
* producción histórica

---

# UX OPERATIVA

Los usuarios deben entender rápidamente:

* cuánto debe el taller
* cuánto produjo
* cuánto falta
* cuánto se paga

---

# NUNCA

* dashboards complejos
* gráficos innecesarios
* procesos lentos

---

# RESULTADO ESPERADO

Un módulo talleres:

* rápido
* operativo
* auditable
* claro
* consistente con stock
* consistente con movimientos
* consistente con operación real TML
