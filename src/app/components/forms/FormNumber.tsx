import React from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "../ui/Button";

export interface FormNumberProps {
  label?: string;
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  error?: string;
  helperText?: string;
  id?: string;
  disabled?: boolean;
}

export const FormNumber: React.FC<FormNumberProps> = ({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  error,
  helperText,
  disabled = false,
}) => {
  const handleDecrement = () => {
    if (disabled) return;
    const nextVal = value - step;
    if (min !== undefined && nextVal < min) return;
    onChange(nextVal);
  };

  const handleIncrement = () => {
    if (disabled) return;
    const nextVal = value + step;
    if (max !== undefined && nextVal > max) return;
    onChange(nextVal);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const nextVal = parseFloat(e.target.value);
    if (isNaN(nextVal)) return;
    if (min !== undefined && nextVal < min) return;
    if (max !== undefined && nextVal > max) return;
    onChange(nextVal);
  };

  return (
    <div className="space-y-1.5 flex-1 select-none">
      {label && <label className="block text-xs font-bold text-[#0F172A] uppercase">{label}</label>}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={handleDecrement}
          disabled={disabled || (min !== undefined && value <= min)}
          className="h-11 w-11 mobile:h-12 mobile:w-12 text-[#0F172A] border-[#E2E8F0] shrink-0"
          aria-label="Disminuir"
        >
          <Minus className="w-4 h-4" />
        </Button>
        <div className="relative rounded-lg overflow-hidden flex items-center bg-white border border-[#E2E8F0] focus-within:border-[#1F6F4A] focus-within:ring-2 focus-within:ring-[#EAF5EF] transition-all duration-150 h-11 mobile:h-12 w-full">
          <input
            type="number"
            value={value}
            onChange={handleInputChange}
            disabled={disabled}
            className="w-full h-full text-center text-sm font-bold text-[#0F172A] focus:outline-none placeholder-slate-450 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed text-mono"
          />
        </div>
        <Button
          variant="outline"
          onClick={handleIncrement}
          disabled={disabled || (max !== undefined && value >= max)}
          className="h-11 w-11 mobile:h-12 mobile:w-12 text-[#0F172A] border-[#E2E8F0] shrink-0"
          aria-label="Incrementar"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      {error && <p className="text-[11px] font-bold text-[#E11D48]">{error}</p>}
      {!error && helperText && <p className="text-[11px] text-[#475569]">{helperText}</p>}
    </div>
  );
};
