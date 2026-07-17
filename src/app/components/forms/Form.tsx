import React, { FormHTMLAttributes } from "react";

export interface FormProps extends FormHTMLAttributes<HTMLFormElement> {
  children: React.ReactNode;
}

export const Form: React.FC<FormProps> = ({ children, ...props }) => {
  return (
    <form className="space-y-6" {...props}>
      {children}
    </form>
  );
};

export interface FormSectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormSection: React.FC<FormSectionProps> = ({
  title,
  description,
  children,
  className = "",
}) => {
  return (
    <div className={`space-y-4 border-b border-[#E2E8F0] pb-6 last:border-b-0 last:pb-0 ${className}`}>
      {(title || description) && (
        <div className="space-y-1">
          {title && <h4 className="text-sm font-bold text-[#0F172A] tracking-tight">{title}</h4>}
          {description && <p className="text-xs text-[#475569]">{description}</p>}
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </div>
  );
};

export interface FormRowProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}

export const FormRow: React.FC<FormRowProps> = ({
  children,
  columns = 1,
  className = "",
}) => {
  const columnGrid = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2 gap-4",
    3: "grid-cols-1 md:grid-cols-3 gap-4",
    4: "grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4",
  };

  return <div className={`grid ${columnGrid[columns]} gap-4 ${className}`}>{children}</div>;
};
