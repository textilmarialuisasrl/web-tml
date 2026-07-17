import React, { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "../ui/Button";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
}) => {
  // Evitar scroll de fondo al abrir cajón
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 select-none">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-200 animate-fadeIn"
        onClick={onClose}
      />

      {/* Panel Contenedor: Drawer lateral en Desktop, BottomSheet de un toque en Mobile */}
      <div
        className="fixed inset-y-0 right-0 w-full md:max-w-md bg-white border-l border-[#E2E8F0] shadow-overlay flex flex-col justify-between
          mobile:inset-x-0 mobile:bottom-0 mobile:top-auto mobile:h-[80vh] mobile:w-full mobile:rounded-t-2xl mobile:border-t mobile:border-l-0
          transition-transform duration-200 ease-out transform"
      >
        {/* Mobile drag handle line */}
        <div className="hidden mobile:flex justify-center py-2 shrink-0">
          <div className="w-12 h-1.5 rounded-full bg-slate-200" />
        </div>

        {/* Cabecera */}
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex justify-between items-center shrink-0">
          <span className="font-bold text-sm text-[#0F172A] uppercase tracking-wider">{title}</span>
          <Button variant="ghost" size="sm" onClick={onClose} className="p-1 h-8 w-8 shrink-0">
            <X className="w-4.5 h-4.5 text-slate-400" />
          </Button>
        </div>

        {/* Cuerpo con scroll propio */}
        <div className="p-5 flex-1 overflow-y-auto no-scrollbar">{children}</div>

        {/* Pie de acción */}
        {footer && (
          <div className="px-5 py-4 border-t border-[#E2E8F0] bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
