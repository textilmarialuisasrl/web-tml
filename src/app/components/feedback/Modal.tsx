import React, { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "../ui/Button";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
}) => {
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

  const sizes = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-xl",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-on-background/40 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Modal Box */}
      <div
        className={`w-full bg-surface-container-lowest border border-outline-variant shadow-overlay rounded-lg overflow-hidden flex flex-col z-10 transition-all transform animate-fadeIn ${sizes[size]}`}
      >
        <div className="px-5 py-4 border-b border-outline-variant flex justify-between items-center shrink-0">
          <span className="font-bold text-sm text-on-surface uppercase tracking-wider">{title}</span>
          <Button variant="ghost" size="sm" onClick={onClose} className="p-1 h-8 w-8 shrink-0">
            <X className="w-4.5 h-4.5 text-on-surface-variant" />
          </Button>
        </div>
        <div className="p-5 overflow-y-auto max-h-[70vh] no-scrollbar text-xs text-on-surface">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-outline-variant bg-surface-container-low flex items-center justify-end gap-2.5 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
