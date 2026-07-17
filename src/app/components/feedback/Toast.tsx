import React, { createContext, useContext, useState, ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

export interface ToastContextType {
  show: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = (message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      remove(id);
    }, 4000);
  };

  const success = (message: string) => show(message, "success");
  const error = (message: string) => show(message, "error");
  const info = (message: string) => show(message, "info");

  const remove = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ show, success, error, info }}>
      {children}
      {/* Toast container overlay */}
      <div className="fixed top-4 right-4 z-[70] flex flex-col gap-2 w-full max-w-sm mobile:left-4 mobile:right-4 mobile:max-w-none select-none">
        {toasts.map((t) => {
          const icons = {
            success: <CheckCircle2 className="w-5 h-5 text-[#16A34A] shrink-0" />,
            error: <AlertCircle className="w-5 h-5 text-[#E11D48] shrink-0" />,
            info: <Info className="w-5 h-5 text-[#2563EB] shrink-0" />,
          };

          const bgColors = {
            success: "bg-[#DCFCE7] border-[#BBF7D0] text-[#16A34A]",
            error: "bg-[#FFE4E6] border-[#FECDD3] text-[#E11D48]",
            info: "bg-[#DBEAFE] border-[#BFDBFE] text-[#2563EB]",
          };

          return (
            <div
              key={t.id}
              className={`flex items-start justify-between gap-3 p-3.5 rounded-xl border shadow-overlay animate-fadeIn ${bgColors[t.type]}`}
            >
              <div className="flex gap-2.5 items-start">
                {icons[t.type]}
                <p className="text-xs font-bold leading-relaxed">{t.message}</p>
              </div>
              <button
                onClick={() => remove(t.id)}
                className="text-current opacity-70 hover:opacity-100 transition-opacity shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
