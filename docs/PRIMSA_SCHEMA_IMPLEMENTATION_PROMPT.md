# ERP TML - PRISMA SCHEMA IMPLEMENTATION

## OBJETIVO

Implementar el schema Prisma REAL del ERP TML siguiendo estrictamente:

* MASTER_SYSTEM_PROMPT.md
* STOCK_ENGINE_PROMPT.md
* ARCHITECTURE_PROMPT.md
* DOMAIN_MODEL_PROMPT.md

No improvisar entidades alternativas.

No simplificar relaciones críticas.

---

# OBJETIVO DE ESTA ETAPA

Implementar:

* enums
* modelos
* relaciones
* índices
* constraints
* auditoría base
* stock actual
* movimientos
* permisos
* usuarios
* talleres
* depósitos

El schema debe quedar listo para producción.

---

# IMPORTANTE

El schema debe diseñarse para:

* escalabilidad
* auditoría
* performance
* trazabilidad

---

# ENUMS OBLIGATORIOS

Implementar:

## TipoMovimiento

* ENTREGA_TALLER
* DEVOLUCION_TALLER
* MOVIMIENTO_INTERNO
* EGRESO
* AJUSTE
* RECONVERSION
* INGRESO_MANUAL

---

## CalidadProducto

* PERFECTO
* FALLADO
* SIN_ETIQUETA

---

## EstadoStock

* DISPONIBLE
* EN_TALLER
* ZONA_CORTE
* FALLADO
* MINORISTA
* SIN_ETIQUETA

---

# MODELOS OBLIGATORIOS

## Usuario

Campos mínimos:

* id
* nombre
* email unique
* passwordHash
* activo
* createdAt
* updatedAt

Relaciones:

* permisos
* movimientos
* auditorías

---

## Permiso

Campos:

* id
* codigo unique
* descripcion

---

## UsuarioPermiso

Tabla pivote.

---

## Producto

Campos:

* id
* nombre
* descripcion
* categoria
* medida
* colores
* unidadesPorFardo
* permiteUnidad
* activo
* createdAt
* updatedAt

Relaciones:

* movimientos
* stockActual

---

## Deposito

Campos:

* id
* nombre unique
* descripcion
* activo

---

## Taller

Campos:

* id
* nombre unique
* observaciones
* activo

---

## Movimiento

Modelo central del sistema.

Campos:

* id
* tipo
* productoId
* depositoOrigenId nullable
* depositoDestinoId nullable
* tallerId nullable
* calidad
* estadoStock
* cantidadUnidades
* observaciones nullable
* usuarioId
* createdAt

---

# IMPORTANTE

cantidadUnidades:
SIEMPRE en unidades simples.

Nunca almacenar:

* fardos
* docenas

---

# RELACIONES MOVIMIENTO

Movimiento debe relacionar:

* producto
* usuario
* taller
* depósito origen
* depósito destino
* insumos
* reconversiones

---

## MovimientoInsumo

Campos:

* id
* movimientoId
* descripcion
* cantidad

---

## Reconversion

Campos:

* id
* movimientoId
* productoOrigenId
* productoDestinoId
* cantidadUnidades

---

## StockActual

Tabla optimizada.

Campos:

* id
* productoId
* depositoId
* calidad
* estadoStock
* cantidadUnidades
* updatedAt

---

# IMPORTANTE

Agregar constraint unique compuesto:

* productoId
* depositoId
* calidad
* estadoStock

---

# AUDITORIA

## Auditoria

Campos:

* id
* usuarioId
* accion
* entidad
* entidadId
* cambios Json
* createdAt

---

# RELACIONES IMPORTANTES

Definir correctamente:

* onDelete
* índices
* nombres explícitos de relaciones

Evitar ambigüedad Prisma.

---

# ÍNDICES IMPORTANTES

Agregar índices en:

## Movimiento

* createdAt
* productoId
* tallerId
* tipo

---

## StockActual

* productoId
* depositoId
* estadoStock

---

# REGLAS IMPORTANTES

## NUNCA

* duplicar productos fallados
* duplicar productos sin etiqueta
* guardar docenas/fardos
* usar relaciones ambiguas

---

# SIEMPRE

* usar nombres claros
* relaciones explícitas
* timestamps
* índices útiles

---

# IMPORTANTE

El schema debe ser:

* limpio
* profesional
* mantenible
* escalable

---

# RESULTADO ESPERADO

Un schema Prisma listo para:

* stock engine
* movimientos complejos
* talleres
* auditoría
* reportes
* escalabilidad futura
