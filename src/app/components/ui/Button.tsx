import React, { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = "",
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      type = "button",
      ...props
    },
    ref
  ) => {
    // Clases base (Redondez 4px = rounded)
    const baseStyles =
      "inline-flex items-center justify-center font-semibold rounded transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98] cursor-pointer";

    // Variantes de estilo alineadas con el Design System de Stitch
    const variants = {
      primary:
        "bg-primary hover:brightness-105 text-white border border-transparent focus-visible:ring-primary",
      secondary:
        "bg-secondary-container hover:brightness-95 text-on-secondary-container border border-transparent focus-visible:ring-secondary",
      outline:
        "bg-surface-container-lowest hover:bg-surface-container-low text-on-surface border border-outline-variant focus-visible:ring-outline",
      danger:
        "bg-error hover:brightness-105 text-white border border-transparent focus-visible:ring-error",
      ghost:
        "bg-transparent hover:bg-surface-container-low text-on-surface-variant hover:text-on-surface focus-visible:ring-primary",
    };

    // Tamaños táctiles (respetando los lineamientos de accesibilidad)
    const sizes = {
      sm: "px-3 py-1.5 text-xs h-9",
      md: "px-4 py-2.5 text-sm h-11 mobile:h-12", // 44px en desktop, 48px en móvil
      lg: "px-6 py-3.5 text-base h-12 mobile:h-14",
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        aria-busy={isLoading}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {!isLoading && leftIcon && <span className="mr-2 inline-flex">{leftIcon}</span>}
        <span className="truncate">{children}</span>
        {!isLoading && rightIcon && <span className="ml-2 inline-flex">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = "Button";
