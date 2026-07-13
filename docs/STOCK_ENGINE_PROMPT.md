# STOCK ENGINE - TEXTIL MARIA LUISA

## OBJETIVO

El sistema de stock será el núcleo operativo del ERP.

Toda modificación de stock debe pasar obligatoriamente por el motor de movimientos.

Nunca modificar stock manualmente fuera del sistema de movimientos.

---

# PRINCIPIO FUNDAMENTAL

El stock NO representa solamente productos terminados.

El sistema debe representar el ciclo completo:

* disponible
* en producción
* en taller
* fallado
* sin etiqueta
* minorista
* zona de corte

---

# TIPOS DE STOCK

## STOCK DISPONIBLE

Productos terminados listos para venta o despacho.

Ubicados en depósitos.

---

## STOCK EN TALLER

Representa cortadas enviadas a talleres y aún no devueltas.

Se calcula automáticamente desde entregas y devoluciones.

---

## STOCK EN ZONA DE CORTE

Representa:

* cortadas preparadas
* retazos
* productos minoristas
* productos sin etiqueta

---

## STOCK FALLADO

Productos:

* defectuosos
* imperfectos
* vendidos minorista
* reconvertibles

---

## STOCK SIN ETIQUETA

Productos finales correctos pero no etiquetados.

Pueden venderse minorista.

---

# MOVIMIENTOS

Todo cambio genera movimiento auditable.

Nunca modificar stock directamente.

---

# TIPOS DE MOVIMIENTOS

## ENTREGA_TALLER

Envía cortadas al taller.

Características:

* siempre en unidades simples
* puede incluir múltiples productos
* puede incluir insumos
* genera saldo pendiente

---

## DEVOLUCION_TALLER

Ingreso de producción terminada desde taller.

Puede incluir:

* fardos
* docenas
* unidades

Debe:

* descontar saldo pendiente
* ingresar stock terminado
* registrar fallados
* registrar reconversiones

---

## MOVIMIENTO_INTERNO

Movimiento entre depósitos.

No altera stock total global.

---

## EGRESO

Salida definitiva de stock.

Ejemplos:

* pedido retirado
* flete
* venta minorista

---

## AJUSTE

Corrección manual excepcional.

Debe:

* requerir observación
* quedar auditado

---

# SALDOS DE TALLER

El sistema NO trabaja por lotes físicos.

Los talleres manejan saldos pendientes.

Ejemplo:

Martes:

* entrega 60 unidades trapo mediano

Miércoles:

* entrega 60 unidades trapo mediano
* devolución 30 unidades terminadas

Saldo pendiente:

* 90 entregadas
* 30 devueltas
* 60 pendientes

---

# DEVOLUCIONES PARCIALES

Las devoluciones pueden ser parciales.

Nunca asumir que el taller devuelve todo.

---

# RECONVERSIONES

Los fallados pueden reconvertirse.

Ejemplos:

* fallado grande → mediano
* fallado grande → chico
* fallado mediano → chico

La reconversión:

* consume saldo pendiente original
* genera nuevo producto terminado

---

# UNIDADES DE MEDIDA

TODO el sistema debe soportar simultáneamente:

* unidad
* docena
* fardo

---

# CONVERSIONES

Las conversiones deben ser automáticas.

Ejemplo:

* producto x60:

  * 1 fardo = 60 unidades
  * 1 docena = 12 unidades

---

# VISUALIZACIÓN

El usuario puede visualizar:

* unidades
* docenas
* fardos

en cualquier pantalla.

---

# PRODUCTOS

Cada producto define:

* unidadesPorFardo
* permiteUnidad
* categoría
* calidad
* presentación

---

# CALIDAD DE PRODUCTO

Los productos pueden existir como:

* perfecto
* fallado
* sin_etiqueta

---

# DEPÓSITOS

El stock siempre pertenece a:

* producto
* depósito
* calidad
* estado

---

# MOVIMIENTOS INTERNOS

Los movimientos internos:

* cambian ubicación
* no alteran stock total

---

# MINORISTA

La zona de corte puede vender:

* fallados
* sin etiqueta
* productos finales
* docenas sueltas
* unidades sueltas

---

# RETAZOS

Zona de corte almacena retazos.

Los retazos:

* pueden reutilizarse
* especialmente para trapos de 80 cm

---

# INSUMOS

Los talleres también reciben:

* hilo
* bolsas
* etiquetas
* agua
* aceite

Los insumos deben quedar registrados.

---

# REGLAS CRÍTICAS

## NUNCA

* modificar stock directo
* duplicar stock
* generar movimientos sin auditoría
* asumir devoluciones completas

---

# SIEMPRE

* usar transacciones
* registrar usuario responsable
* registrar fecha
* registrar observaciones
* mantener trazabilidad

---

# UX OPERATIVA

Las cargas deben ser rápidas.

Priorizar:

* inputs numéricos
* autocompletado
* selects rápidos
* flujos simples

---

# OBJETIVO FINAL

El sistema debe permitir conocer en tiempo real:

* qué hay disponible
* qué está en taller
* qué está pendiente
* qué está fallado
* qué está en depósitos
* qué está en corte
* qué salió
* qué volvió
