/**
 * Maps technical backend/sync error messages to friendly operator-facing messages.
 */
export const formatSyncError = (errorMsg: string | null): string => {
  if (!errorMsg) return "Rechazado por validación";

  const lower = errorMsg.toLowerCase();

  // Permisos insuficientes
  if (
    lower.includes("cannot read properties of undefined") || 
    lower.includes("permisos") || 
    lower.includes("forbidden") || 
    lower.includes("unauthorized") ||
    lower.includes("no autorizado")
  ) {
    return "⚠ Permisos insuficientes: Error al verificar permisos del usuario emisor.";
  }

  // Stock insuficiente
  if (
    lower.includes("insufficient_stock") || 
    lower.includes("insuficiente") || 
    lower.includes("stock") || 
    lower.includes("saldo")
  ) {
    return "⚠ Stock insuficiente: No hay stock suficiente disponible para completar la operación.";
  }

  // Conflicto
  if (
    lower.includes("duplicate_operation") || 
    lower.includes("duplicado") || 
    lower.includes("collision") || 
    lower.includes("conflict")
  ) {
    return "⚠ Conflicto: Este movimiento ya ha sido procesado por el servidor.";
  }

  // Errores de validación genéricos
  if (
    lower.includes("required") || 
    lower.includes("must specify") || 
    lower.includes("same_origin_destination") || 
    lower.includes("product_not_found") ||
    lower.includes("validation") ||
    lower.includes("debe especificar")
  ) {
    return `⚠ Error de validación: ${errorMsg}`;
  }

  return errorMsg;
};
