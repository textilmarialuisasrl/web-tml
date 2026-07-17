import React from "react";
import { Breadcrumb, BreadcrumbItem } from "./Breadcrumb";

export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  breadcrumbs = [],
  actions,
  className = "",
}) => {
  return (
    <div
      className={`border-b border-outline-variant bg-surface px-6 py-5 flex flex-col gap-3 select-none ${className}`}
    >
      {breadcrumbs.length > 0 && <Breadcrumb items={breadcrumbs} />}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-on-surface tracking-tight">{title}</h1>
          {description && <p className="text-xs text-on-surface-variant">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
};
