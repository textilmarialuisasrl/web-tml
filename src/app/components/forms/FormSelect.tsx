import React, { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
  helperText?: string;
  placeholder?: string;
}

export const FormSelect = React.forwardRef<HTMLSelectElement, FormSelectProps>(
  (
    {
      label,
      options,
      error,
      helperText,
      placeholder,
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
        <div className="relative rounded overflow-hidden bg-surface-container-lowest border border-outline focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-container/20 transition-all duration-150 h-10 mobile:h-11 flex items-center pr-3">
          <select
            id={id}
            ref={ref}
            disabled={disabled}
            className={`w-full h-full pl-3 pr-8 text-xs text-on-surface bg-transparent focus:outline-none appearance-none disabled:bg-surface-container-low disabled:text-outline disabled:cursor-not-allowed ${className}`}
            defaultValue=""
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant shrink-0">
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
        {error && <p className="text-[10px] font-bold text-error">{error}</p>}
        {!error && helperText && <p className="text-[10px] text-on-surface-variant">{helperText}</p>}
      </div>
    );
  }
);

FormSelect.displayName = "FormSelect";
