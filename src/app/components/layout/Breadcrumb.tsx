import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className = "" }) => {
  return (
    <nav className={`flex select-none ${className}`} aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5 text-xs text-on-surface-variant">
        <li>
          <Link to="/app/" className="hover:text-primary transition-colors font-medium">
            Inicio
          </Link>
        </li>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <React.Fragment key={index}>
              <ChevronRight className="w-3.5 h-3.5 text-outline-variant shrink-0" />
              <li>
                {isLast || !item.to ? (
                  <span className="font-bold text-on-surface truncate max-w-[120px] md:max-w-xs inline-block">
                    {item.label}
                  </span>
                ) : (
                  <Link
                    to={item.to}
                    className="hover:text-primary transition-colors font-medium"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
};
