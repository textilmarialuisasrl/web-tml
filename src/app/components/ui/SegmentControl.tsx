import React from "react";

interface SegmentOption {
  label: string;
  value: string;
}

interface SegmentControlProps {
  options: SegmentOption[];
  value: string;
  onChange: (val: any) => void;
  label?: string;
}

export const SegmentControl: React.FC<SegmentControlProps> = ({
  options,
  value,
  onChange,
  label,
}) => {
  const triggerHaptic = () => {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(30); // subtle tap vibration
    }
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
          {label}
        </label>
      )}
      <div className="segment-container">
        {options.map((opt) => {
          const isActive = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                triggerHaptic();
                onChange(opt.value);
              }}
              className={`segment-btn ${
                isActive ? "segment-btn-active" : "segment-btn-inactive"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SegmentControl;
