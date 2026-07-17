/**
 * Design Tokens oficiales del ERP de Textil María Luisa (TML)
 * Alineados estrictamente con el Design System aprobado en la Fase 2 / Stitch.
 */

export const tokens = {
  // Paleta de colores en Hexadecimal para usos dinámicos y estilos en JS
  colors: {
    primary: "#006e05",                 // Verde TML Oficial
    primaryContainer: "#42ff3b",        // Verde claro para contenedores
    onPrimaryContainer: "#007205",      // Verde oscuro para texto sobre primaryContainer
    secondary: "#565e74",               // Slate de soporte
    secondaryContainer: "#dae2fd",      // Fondo de item activo
    onSecondaryContainer: "#5c647a",    // Texto de item activo
    tertiary: "#505f76",
    tertiaryContainer: "#cfdffa",
    onTertiaryContainer: "#536379",
    error: "#ba1a1a",                   // Rojo peligro/error
    errorContainer: "#ffdad6",
    onErrorContainer: "#93000a",
    
    bg: "#f7f9fb",                      // Superficie general
    onBackground: "#191c1e",
    surface: "#f7f9fb",
    onSurface: "#191c1e",
    surfaceVariant: "#e0e3e5",
    onSurfaceVariant: "#3c4b37",
    
    outline: "#6c7c65",                 // Bordes de componentes
    outlineVariant: "#baccb1",          // Bordes claros
    
    surfaceDim: "#d8dadc",
    surfaceBright: "#f7f9fb",
    surfaceContainerLowest: "#ffffff",  // Fondos de tarjeta y inputs
    surfaceContainerLow: "#f2f4f6",     // Fondo de barra lateral
    surfaceContainer: "#eceef0",
    surfaceContainerHigh: "#e6e8ea",
    surfaceContainerHighest: "#e0e3e5", // Bordes divisorios
  },

  // Escala de espaciados basados en la especificación Stitch (4px base)
  spacing: {
    unit: "4px",
    gutter: "16px",
    containerPaddingMobile: "16px",
    containerPaddingDesktop: "24px",
    rowHeightDense: "32px",
    rowHeightStandard: "48px",
  },

  // Escala de bordes redondeados (Stitch Roundness: ROUND_FOUR = 4px)
  radius: {
    sm: "2px",      // ROUND_TWO (Chips, badges)
    DEFAULT: "4px", // ROUND_FOUR (Botones, Inputs, Dropdowns)
    lg: "8px",      // ROUND_EIGHT (Tarjetas, Modales)
    xl: "12px",     // ROUND_TWELVE
    full: "9999px", // Píldoras
  },

  // Sombras y elevaciones sutiles (Estilo Vercel/Linear)
  shadows: {
    none: "none",
    sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    overlay: "0 4px 6px rgba(0,0,0,0.05)",
  },

  // Jerarquía de capas (z-index)
  zIndex: {
    base: 0,
    topbar: 40,
    drawer: 50,
    modal: 60,
    toast: 70,
  },
};

export type DesignTokens = typeof tokens;
