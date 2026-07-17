import React from "react";

export interface SkeletonProps {
  className?: string;
  variant?: "text" | "rect" | "circle";
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = "",
  variant = "rect",
}) => {
  const base = "bg-slate-200 animate-pulse shrink-0";
  const variants = {
    rect: "rounded-lg",
    text: "h-3.5 w-full rounded",
    circle: "rounded-full",
  };

  return <div className={`${base} ${variants[variant]} ${className}`} />;
};
