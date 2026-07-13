import React from "react";
import { Delete } from "lucide-react";

interface NumericPadProps {
  value: string;
  onChange: (val: string) => void;
  maxLength?: number;
  allowDecimal?: boolean;
}

export const NumericPad: React.FC<NumericPadProps> = ({
  value,
  onChange,
  maxLength = 10,
  allowDecimal = false,
}) => {
  // Trigger a short physical vibration (haptic feedback) for action reinforcement
  const triggerHaptic = () => {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(35);
    }
  };

  const handleKeyPress = (char: string) => {
    triggerHaptic();

    if (char === "BACK") {
      onChange(value.slice(0, -1));
      return;
    }

    if (char === "CLEAR") {
      onChange("");
      return;
    }

    if (value.length >= maxLength) return;

    if (char === ".") {
      if (!allowDecimal) return;
      if (value.includes(".")) return;
      if (value === "") {
        onChange("0.");
        return;
      }
    }

    onChange(value + char);
  };

  const buttons = [
    "1", "2", "3",
    "4", "5", "6",
    "7", "8", "9",
    allowDecimal ? "." : "CLEAR", "0", "BACK"
  ];

  return (
    <div className="w-full max-w-sm mx-auto bg-slate-900 border-2 border-slate-800 p-3 rounded-md shadow-md select-none font-sans">
      <div className="grid grid-cols-3 gap-2">
        {buttons.map((btn, index) => {
          let content: React.ReactNode = btn;
          let btnClass = "";

          if (btn === "BACK") {
            content = <Delete className="w-5 h-5 mx-auto" />;
            btnClass = "bg-red-950/40 hover:bg-red-900/40 active:bg-red-800/40 text-red-300 border-2 border-red-900/60";
          } else if (btn === "CLEAR") {
            content = <span className="text-xs font-black tracking-wider">BORRAR</span>;
            btnClass = "bg-slate-850 hover:bg-slate-805 active:bg-slate-750 text-slate-300 border-2 border-slate-750";
          } else {
            btnClass = "bg-slate-950 border-2 border-slate-850 hover:bg-slate-900 active:bg-slate-850 text-slate-100 font-black text-xl";
          }

          return (
            <button
              key={index}
              type="button"
              onClick={() => handleKeyPress(btn)}
              className={`h-16 flex items-center justify-center rounded-md transition duration-100 active:scale-[0.96] touch-manipulation cursor-pointer ${btnClass}`}
              style={{ minHeight: "64px" }}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default NumericPad;
