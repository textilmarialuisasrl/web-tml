/**
 * Helper utilities for conversion between units, fardos, and docenas.
 * NOTE: The TML system ALWAYS stores stock internally as units (cantidadUnidades).
 */

/**
 * Converts units into fractional fardos.
 */
export function unidadesAFardos(unidades: number, unidadesPorFardo: number): number {
  if (unidadesPorFardo <= 0) return 0;
  return unidades / unidadesPorFardo;
}

/**
 * Converts fardos into units.
 */
export function fardosAUnidades(fardos: number, unidadesPorFardo: number): number {
  return Math.round(fardos * unidadesPorFardo);
}

/**
 * Converts units into docenas.
 */
export function unidadesADocenas(unidades: number): number {
  return unidades / 12;
}

/**
 * Converts docenas into units.
 */
export function docenasAUnidades(docenas: number): number {
  return Math.round(docenas * 12);
}

/**
 * Formats a stock quantity of units into a human-readable string in Spanish.
 * Example: 75 units (with 60 units/fardo) -> "1 Fardo y 15 Unidades"
 */
export function formatearStock(unidades: number, unidadesPorFardo: number): string {
  if (unidadesPorFardo <= 0) {
    return `${unidades} Unidades`;
  }
  const fardos = Math.floor(unidades / unidadesPorFardo);
  const residuoUnidades = unidades % unidadesPorFardo;

  const fardosText = fardos === 1 ? "1 Fardo" : `${fardos} Fardos`;
  const unidadesText = residuoUnidades === 1 ? "1 Unidad" : `${residuoUnidades} Unidades`;

  if (fardos > 0 && residuoUnidades > 0) {
    return `${fardosText} y ${unidadesText}`;
  } else if (fardos > 0) {
    return fardosText;
  } else {
    return unidadesText;
  }
}
