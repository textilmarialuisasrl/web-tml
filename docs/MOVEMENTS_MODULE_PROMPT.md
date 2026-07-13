# ERP TML - MOVEMENTS MODULE PROMPT

## OBJETIVO

Implementar el módulo central de movimientos del ERP TML siguiendo estrictamente:

* MASTER_SYSTEM_PROMPT.md
* STOCK_ENGINE_PROMPT.md
* ARCHITECTURE_PROMPT.md
* DOMAIN_MODEL_PROMPT.md
* OPERATION_FLOWS_PROMPT.md

No simplificar lógica crítica.

---

# OBJETIVO DEL MÓDULO

Implementar:

* creación de movimientos
* stock automático
* entregas a taller
* devoluciones
* movimientos internos
* egresos
* auditoría
* saldos pendientes
* conversiones
* UX móvil rápida

---

# IMPORTANTE

El módulo de movimientos es el núcleo operativo del sistema.

Todo cambio de stock debe pasar por este módulo.

---

# TIPOS DE MOVIMIENTO

Implementar soporte completo para:

* ENTREGA_TALLER
* DEVOLUCION_TALLER
* MOVIMIENTO_INTERNO
* EGRESO
* AJUSTE
* RECONVERSION

---

# REGLA CRÍTICA

Nunca modificar stock directamente.

Todo debe generar:

* Movimiento
* actualización StockActual
* auditoría

---

# IMPLEMENTAR BACKEND

---

# SERVICES

Crear:

src/backend/services/movements/

---

# IMPLEMENTAR

## createMovementService

Responsable de:

* validar movimiento
* abrir transacción
* crear movimiento
* actualizar stock
* generar auditoría

---

# STOCK UPDATE ENGINE

Implementar función centralizada:

updateStock()

Debe:

* crear StockActual si no existe
* actualizar cantidades
* validar negativos cuando corresponda

---

# IMPORTANTE

StockActual:
NO es fuente de verdad.

Es cache operacional.

---

# ENTREGA_TALLER

Debe:

* descontar zona corte
* aumentar EN_TALLER
* registrar taller
* registrar insumos opcionales

---

# DEVOLUCION_TALLER

Debe:

* disminuir EN_TALLER
* aumentar DISPONIBLE
* permitir:

  * fardos
  * docenas
  * unidades
* convertir automáticamente a unidades

---

# CONVERSIONES

Implementar helper centralizado:

* unidades → docenas
* unidades → fardos
* docenas → unidades
* fardos → unidades

Nunca duplicar lógica.

---

# RECONVERSIONES

Implementar lógica real:

Ejemplo:

* grande FALLADO → chico PERFECTO

Debe:

* descontar saldo original
* crear movimiento reconversión
* ingresar nuevo producto

---

# MOVIMIENTO_INTERNO

Debe:

* mover entre depósitos
* no alterar stock global

---

# EGRESO

Debe:

* descontar stock disponible
* registrar motivo
* permitir minorista

---

# AJUSTE

Debe:

* requerir observación obligatoria
* quedar auditado

---

# VALIDACIONES IMPORTANTES

Validar:

* stock suficiente
* depósitos válidos
* productos activos
* taller válido
* cantidades positivas

---

# AUDITORÍA

Toda operación:

* usuario
* fecha
* tipo
* cambios

---

# SALDOS TALLER

Implementar helper:

getWorkshopPendingBalance()

Debe calcular:

* entregado
* devuelto
* pendiente

---

# FRONTEND

Implementar módulo:

src/frontend/modules/movements/

---

# UX MOBILE-FIRST

Priorizar:

* inputs grandes
* selects rápidos
* teclado numérico
* pocos clicks

---

# PANTALLAS

Implementar:

## Nueva entrega taller

Flujo:

1. seleccionar taller
2. agregar productos
3. cantidades
4. insumos opcionales
5. confirmar
6. preguntar devolución
7. generar PDF

---

## Nueva devolución taller

Mostrar:

* saldos pendientes
* cantidades rápidas
* conversión automática

---

## Movimiento interno

Flujo ultra rápido.

---

## Nuevo egreso

Debe soportar:

* retiro fábrica
* flete
* minorista

---

# COMPONENTES IMPORTANTES

Implementar:

* ProductQuantityInput
* UnitConverter
* StockBadge
* PendingBalanceCard
* MovementTypeSelector

---

# UNIT CONVERTER

Debe permitir visualizar simultáneamente:

* unidades
* docenas
* fardos

---

# IMPORTANTE

Internamente:
TODO se guarda en unidades.

---

# PDFS

Preparar arquitectura para PDFs.

NO implementar diseño final todavía.

---

# UX CRÍTICA

Los operarios usarán teléfono.

Priorizar:

* velocidad extrema
* simplicidad
* inputs rápidos

---

# NUNCA

* formularios gigantes
* tablas desktop complejas
* pasos innecesarios

---

# RESULTADO ESPERADO

Un módulo de movimientos:

* sólido
* rápido
* móvil
* auditable
* escalable
* consistente con operación real TML
