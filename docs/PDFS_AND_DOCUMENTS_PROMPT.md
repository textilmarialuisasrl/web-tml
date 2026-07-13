# ERP TML - PDFS AND DOCUMENTS MODULE PROMPT

## OBJETIVO

Implementar el sistema completo de PDFs y comprobantes operativos del ERP TML siguiendo estrictamente:

* MASTER_SYSTEM_PROMPT.md
* STOCK_ENGINE_PROMPT.md
* ARCHITECTURE_PROMPT.md
* DOMAIN_MODEL_PROMPT.md
* OPERATION_FLOWS_PROMPT.md
* MOVEMENTS_MODULE_PROMPT.md
* STOCK_MODULE_PROMPT.md
* WORKSHOPS_MODULE_PROMPT.md

No generar PDFs aislados sin consistencia visual.

---

# PRINCIPIO FUNDAMENTAL

Los PDFs son documentos operativos reales.

Deben:

* imprimirse fácilmente
* archivarse
* entregarse a talleres
* ser claros
* rápidos de entender

---

# OBJETIVO DEL MÓDULO

Implementar generación de PDFs para:

* entregas taller
* devoluciones taller
* comprobantes mixtos
* pagos talleres
* movimientos internos
* egresos

---

# IMPORTANTE

El diseño debe ser:

* simple
* limpio
* operativo
* imprimible A4

No hacer diseños comerciales.

---

# IMPLEMENTAR BACKEND

---

# RUTAS

/api/documents

---

# ENDPOINTS

## GET /api/documents/movement/:id/pdf

Generar PDF movimiento.

---

## GET /api/documents/workshop-payment/:id/pdf

Generar PDF pago taller.

---

## GET /api/documents/workshop-summary/:id/pdf

Resumen taller período.

---

# IMPLEMENTAR SERVICES

Crear:

src/backend/services/documents/

---

# IMPLEMENTAR

## generateMovementPdf()

Debe soportar:

* ENTREGA_TALLER
* DEVOLUCION_TALLER
* comprobante mixto

---

## generateWorkshopPaymentPdf()

Debe generar:

* detalle producción
* equivalencia fardos
* precios
* subtotal
* total

---

# IMPORTANTE

Los PDFs deben generarse:
backend.

Nunca frontend.

---

# TECNOLOGÍA

Usar:

* pdf-lib
  o
* pdfkit

Elegir arquitectura mantenible.

---

# DISEÑO GENERAL

Formato:

* A4 vertical
* márgenes amplios
* tipografía clara

---

# HEADER

Debe incluir:

* logo TML
* nombre empresa
* fecha
* número comprobante

---

# DATOS OPERATIVOS

Debe incluir:

* taller
* usuario
* observaciones
* depósitos
* movimientos relacionados

---

# TABLA PRODUCTOS

Mostrar:

* producto
* calidad
* cantidad
* equivalencia
* observaciones

---

# CONVERSIONES VISUALES

Mostrar:

* unidades
* docenas
* fardos equivalentes

---

# IMPORTANTE

Internamente:
seguir usando unidades.

---

# COMPROBANTE MIXTO

Debe soportar:

* entrega
* devolución

en misma hoja.

---

# REGLA IMPORTANTE

Si durante entrega:
el usuario registra devolución,

el PDF debe incluir:

* ambas operaciones

---

# FALLADOS

Los PDFs deben reflejar:

* fallados
* reconversiones
* sin etiqueta

cuando existan.

---

# PAGO TALLER

El PDF debe incluir:

* período
* detalle producción
* productos
* equivalencias fardos
* precio por fardo
* subtotal
* total final

---

# ESTILO VISUAL

Priorizar:

* claridad
* simplicidad
* lectura rápida

---

# IMPORTANTE

Los empleados:

* imprimen
* archivan
* firman

---

# QR OPCIONAL

Preparar arquitectura futura para:

* QR
* validación comprobante

No implementar aún.

---

# FRONTEND

Implementar:

* botón descargar PDF
* preview simple
* descarga móvil

---

# COMPONENTES IMPORTANTES

Implementar:

* PdfDownloadButton
* DocumentPreviewCard
* WorkshopPaymentPreview

---

# PERFORMANCE

Optimizar:

* generación rápida
* PDFs livianos

---

# NUNCA

* PDFs pesados
* diseños complejos
* tablas ilegibles mobile

---

# RESULTADO ESPERADO

Un sistema de documentos:

* profesional
* rápido
* imprimible
* operativo
* consistente con TML real
* listo para uso diario
