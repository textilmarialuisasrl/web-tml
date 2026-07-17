import React, { InputHTMLAttributes, ReactNode } from "react";

export interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftAddon?: ReactNode;
  rightAddon?: ReactNode;
}

export const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  (
    {
      label,
      error,
      helperText,
      leftAddon,
      rightAddon,
      className = "",
      id,
      disabled = false,
      ...props
    },
    ref
  ) => {
    return (
      <div className="space-y-1 flex-1 select-none text-left">
        {label && (
          <label htmlFor={id} className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
            {label}
          </label>
        )}
        <div className="relative rounded overflow-hidden flex items-center bg-surface-container-lowest border border-outline focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-container/20 transition-all duration-150 h-10 mobile:h-11">
          {leftAddon && (
            <div className="pl-3 pr-2 flex items-center justify-center shrink-0 border-r border-outline bg-surface-container-low text-on-surface-variant text-xs font-bold select-none h-full">
              {leftAddon}
            </div>
          )}
          <input
            id={id}
            ref={ref}
            disabled={disabled}
            className={`w-full h-full px-3 text-xs text-on-surface bg-transparent placeholder-outline focus:outline-none disabled:bg-surface-container-low disabled:text-outline disabled:cursor-not-allowed ${className}`}
            {...props}
          />
          {rightAddon && (
            <div className="pr-3 pl-2 flex items-center justify-center shrink-0 border-l border-outline bg-surface-container-low text-on-surface-variant text-xs font-bold select-none h-full">
              {rightAddon}
            </div>
          )}
        </div>
        {error && <p className="text-[10px] font-bold text-error">{error}</p>}
        {!error && helperText && <p className="text-[10px] text-on-surface-variant">{helperText}</p>}
      </div>
    );
  }
);

FormInput.displayName = "FormInput";
