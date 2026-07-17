import React, { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  headerAction,
  footer,
  className = "",
  ...props
}) => {
  return (
    <div
      className={`bg-surface-container-lowest border border-outline-variant rounded-lg flex flex-col overflow-hidden ${className}`}
      {...props}
    >
      {(title || subtitle || headerAction) && (
        <div className="px-5 py-4 border-b border-outline-variant flex justify-between items-start gap-4">
          <div className="space-y-0.5">
            {title && (
              <h3 className="text-sm font-bold text-on-surface tracking-tight">{title}</h3>
            )}
            {subtitle && <p className="text-xs text-on-surface-variant">{subtitle}</p>}
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>
      )}
      <div className="p-5 flex-1 flex flex-col">{children}</div>
      {footer && (
        <div className="px-5 py-4 bg-surface-container-low border-t border-outline-variant flex items-center justify-end gap-2.5">
          {footer}
        </div>
      )}
    </div>
  );
};
