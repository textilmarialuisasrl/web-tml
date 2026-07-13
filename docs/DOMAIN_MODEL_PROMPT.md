# ERP TML - DOMAIN MODEL PROMPT

## OBJETIVO

Definir el dominio completo del ERP TML.

Toda implementación futura debe respetar estas entidades y relaciones.

Nunca improvisar entidades paralelas o duplicadas.

---

# PRINCIPIO FUNDAMENTAL

El sistema gira alrededor de:

* productos
* stock
* movimientos
* talleres
* depósitos
* estados de producción

---

# ENTIDADES PRINCIPALES

## Usuario

Representa usuarios internos del ERP.

Campos:

* id
* nombre
* email
* passwordHash
* activo
* createdAt
* updatedAt

Relaciones:

* permisos
* movimientos creados
* auditoría

---

## Permiso

Permisos dinámicos del sistema.

Ejemplos:

* STOCK_VER
* STOCK_EDITAR
* MOVIMIENTOS_CREAR
* REPORTES_VER

NO usar roles rígidos.

---

## Producto

Representa cualquier producto manejado por TML.

Incluye:

* fabricados
* tercerizados
* fallados
* sin etiqueta

Campos:

* id
* nombre
* categoria
* medida
* unidadesPorFardo
* permiteUnidad
* activo

---

# IMPORTANTE

NO duplicar productos para:

* fallado
* sin etiqueta

La calidad debe manejarse separadamente.

---

## CalidadProducto

Valores posibles:

* PERFECTO
* FALLADO
* SIN_ETIQUETA

---

## Deposito

Representa ubicaciones físicas.

Ejemplos:

* Galpon TML
* Contenedor
* Zona de corte
* Deposito Eve
* Deposito Vanesa
* Casa TML

Campos:

* id
* nombre
* descripcion
* activo

---

## Taller

Representa talleres externos.

Campos:

* id
* nombre
* activo
* observaciones

---

## Movimiento

Entidad más importante del sistema.

Representa TODO cambio de stock.

Campos:

* id
* tipo
* productoId
* depositoOrigenId
* depositoDestinoId
* tallerId
* calidad
* estadoStock
* cantidadUnidades
* observaciones
* usuarioId
* createdAt

---

# TIPOS DE MOVIMIENTO

Enum:

* ENTREGA_TALLER
* DEVOLUCION_TALLER
* MOVIMIENTO_INTERNO
* EGRESO
* AJUSTE
* RECONVERSION
* INGRESO_MANUAL

---

# PRINCIPIO CRÍTICO

El stock NO se edita directamente.

El stock se calcula desde movimientos.

---

## EstadoStock

Representa el estado operativo.

Valores:

* DISPONIBLE
* EN_TALLER
* ZONA_CORTE
* FALLADO
* MINORISTA
* SIN_ETIQUETA

---

## StockActual

Tabla optimizada para consultas rápidas.

Representa stock consolidado actual.

Campos:

* productoId
* depositoId
* calidad
* estadoStock
* cantidadUnidades

---

# IMPORTANTE

StockActual:

* NO es fuente de verdad
* se deriva desde movimientos
* debe mantenerse sincronizado transaccionalmente

---

## MovimientoInsumo

Representa insumos enviados a talleres.

Ejemplos:

* hilo
* bolsas
* etiquetas
* agua
* aceite

Campos:

* id
* movimientoId
* descripcion
* cantidad

---

## Reconversion

Representa transformación de fallados.

Ejemplo:

* trapo grande → trapo chico

Campos:

* productoOrigenId
* productoDestinoId
* cantidad
* movimientoId

---

## Auditoria

Registro histórico.

Campos:

* usuarioId
* accion
* entidad
* entidadId
* cambios
* createdAt

---

# RELACIONES IMPORTANTES

## Movimiento

Puede tener:

* producto
* taller
* depósito origen
* depósito destino
* usuario
* insumos
* reconversiones

---

# TALLERES

Los talleres NO manejan stock propio real.

El sistema maneja:

* saldos pendientes
* entregas acumuladas
* devoluciones acumuladas

---

# DEVOLUCIONES

Las devoluciones:

* pueden ser parciales
* pueden incluir fallados
* pueden incluir reconversiones

---

# CONVERSIONES

El sistema SIEMPRE almacena:

* unidades simples

Las conversiones:

* docenas
* fardos

son solamente visuales y operativas.

---

# REGLA CRÍTICA

Nunca almacenar:

* fardos
* docenas

como unidad principal.

Siempre unidades simples.

---

# RETAZOS

Los retazos pertenecen a:

* zona de corte
* estado específico

Pueden reutilizarse.

---

# MINORISTA

Minorista NO es otro producto.

Es:

* estado operativo
* canal de salida

---

# MOVIMIENTOS INTERNOS

No modifican stock global.

Solo:

* ubicación

---

# EGRESOS

Representan salida definitiva.

Ejemplos:

* retiro fábrica
* flete
* venta minorista

---

# AUDITORÍA

Toda acción crítica:

* debe registrarse
* debe ser trazable

---

# IMPORTANTE

El sistema debe poder escalar durante años.

Evitar:

* modelos duplicados
* estados ambiguos
* lógica mezclada

Toda entidad debe tener:

* responsabilidad clara
* relaciones claras
* trazabilidad clara
