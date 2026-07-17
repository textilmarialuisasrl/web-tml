import React from "react";
import { Info } from "lucide-react";

export interface EmptyStateProps {
  message: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ message, action }) => {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center select-none max-w-sm mx-auto space-y-4">
      <div className="bg-slate-50 border border-[#E2E8F0] p-4 rounded-full text-slate-350 shrink-0">
        <Info className="w-8 h-8" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-bold text-[#0F172A] uppercase tracking-wide">Sin Registros</p>
        <p className="text-xs text-[#475569] leading-relaxed">{message}</p>
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
};
