# ERP TML - OPERATION FLOWS PROMPT

## OBJETIVO

Definir los flujos operativos reales del ERP TML.

Toda pantalla, endpoint y lógica futura debe respetar estos flujos.

Nunca improvisar flujos distintos.

---

# PRINCIPIO FUNDAMENTAL

El sistema debe adaptarse a cómo trabaja TML actualmente.

NO obligar a los empleados a cambiar radicalmente su forma de trabajo.

---

# FLUJO GENERAL OPERATIVO

1. Zona de corte genera cortadas
2. Cortadas se almacenan temporalmente
3. Se envían cortadas a talleres
4. Talleres devuelven producción
5. Productos ingresan a depósitos
6. Stock se mueve entre depósitos
7. Productos salen por ventas o pedidos

---

# FLUJO - ZONA DE CORTE

## OBJETIVO

Registrar producción parcial preparada para talleres.

---

# OPERACIÓN

Los operarios de corte:

* cortan tela
* identifican producto destino
* guardan retazos
* registran cantidades

---

# RESULTADO

El sistema debe reflejar:

* stock en zona de corte
* retazos disponibles
* productos pendientes de taller

---

# IMPORTANTE

La producción comienza oficialmente en zona de corte.

NO modelar procesos previos:

* algodón
* hilado
* telares

---

# FLUJO - ENTREGA A TALLER

## OBJETIVO

Registrar envío de cortadas e insumos.

---

# OPERACIÓN REAL

Actualmente:

* se escribe en papel
* fecha
* taller
* productos enviados
* cantidades
* insumos
* devoluciones si existen

---

# SISTEMA NUEVO

La carga debe ser:

* extremadamente rápida
* optimizada para teléfono

---

# FLUJO UX

1. Seleccionar taller
2. Agregar productos enviados
3. Agregar cantidades
4. Agregar insumos opcionales
5. Confirmar entrega
6. Preguntar:
   "¿Desea registrar devolución?"
7. Si responde sí:
   abrir flujo devolución
8. Generar PDF final

---

# IMPORTANTE

Entrega y devolución:
pueden coexistir en mismo comprobante PDF.

---

# ENTREGA

Siempre:

* en unidades simples
* asociada a producto específico

---

# INSUMOS

Pueden enviarse:

* hilo
* bolsas
* etiquetas
* aceite
* agua

---

# FLUJO - DEVOLUCIÓN TALLER

## OBJETIVO

Registrar producción terminada.

---

# OPERACIÓN REAL

El taller devuelve:

* fardos
* docenas
* unidades sueltas
* fallados
* reconversiones

---

# IMPORTANTE

Las devoluciones:

* pueden ser parciales
* no necesariamente cierran entregas completas

---

# FLUJO UX

1. Seleccionar taller
2. Mostrar saldos pendientes
3. Agregar devoluciones
4. Permitir:

   * fardos
   * docenas
   * unidades
5. Convertir automáticamente a unidades
6. Registrar fallados
7. Registrar reconversiones
8. Seleccionar depósito destino
9. Confirmar

---

# RECONVERSIONES

Ejemplos válidos:

* grande → mediano
* grande → chico
* mediano → chico

---

# REGLA

La reconversión:

* consume saldo original
* genera producto nuevo terminado

---

# FLUJO - MOVIMIENTO INTERNO

## OBJETIVO

Mover stock entre depósitos.

---

# UX

Debe ser extremadamente rápido.

---

# FLUJO

1. Elegir depósito origen
2. Elegir productos
3. Elegir cantidades
4. Elegir depósito destino
5. Confirmar

---

# IMPORTANTE

No modificar stock global.

Solo ubicación.

---

# FLUJO - EGRESO

## OBJETIVO

Registrar salida definitiva.

---

# TIPOS REALES

* retiro en fábrica
* flete
* minorista

---

# UX

1. Elegir depósito
2. Elegir productos
3. Elegir cantidades
4. Elegir motivo
5. Confirmar

---

# IMPORTANTE

El stock se descuenta SOLO al salir realmente.

No implementar reservas complejas.

---

# FLUJO - MINORISTA

Zona de corte puede vender:

* fallados
* sin etiqueta
* docenas
* unidades

---

# IMPORTANTE

Minorista:

* no es otro producto
* es otro flujo operativo

---

# FLUJO - STOCK

## OBJETIVO

Visualizar rápidamente:

* disponible
* taller
* corte
* fallados
* minorista

---

# REGLA UX

El usuario puede alternar visualización:

* unidades
* docenas
* fardos

en cualquier momento.

---

# FLUJO - TALLERES

## OBJETIVO

Visualizar:

* pendientes
* entregas
* devoluciones
* producción histórica
* pagos

---

# PAGOS

Los pagos:

* se calculan por fardos
* dependen del taller
* dependen del tipo de costura

---

# IMPORTANTE

El detalle:
incluye TODO lo producido en un período.

---

# REPORTES

El sistema debe permitir:

* historial movimientos
* historial talleres
* stock depósitos
* producción
* pagos

---

# PDFS

Generar PDFs imprimibles para:

* entregas
* devoluciones
* pagos

---

# UX GENERAL

Siempre priorizar:

* velocidad
* simplicidad
* botones grandes
* carga rápida
* pocos clicks

---

# NUNCA

* formularios largos
* tablas complejas en móvil
* navegación profunda
* procesos lentos

---

# OBJETIVO FINAL

El sistema debe sentirse:

* rápido
* simple
* operativo
* natural para empleados actuales
