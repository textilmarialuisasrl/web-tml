import React from "react";

export interface BadgeProps {
  variant?: "success" | "warning" | "danger" | "info" | "neutral";
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = "neutral",
  children,
  className = "",
}) => {
  const baseStyles =
    "inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider select-none border";

  const variants = {
    success: "bg-primary-container/10 text-primary border-primary-container/30",
    warning: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    danger: "bg-error-container/10 text-error border-error-container/30",
    info: "bg-secondary-container/10 text-secondary border-secondary-container/30",
    neutral: "bg-surface-container text-on-surface-variant border-outline-variant",
  };

  return (
    <span className={`${baseStyles} ${variants[variant]} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-80" />
      {children}
    </span>
  );
};
