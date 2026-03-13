import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  /** Línea de acento bajo el título (detalle de color) */
  accent?: boolean;
};

export function PageHeader({ title, subtitle, actions, className = "", accent = true }: PageHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`.trim()}>
      <div>
        <h1 className={accent ? "ui-h1 ui-h1-accent" : "ui-h1"}>{title}</h1>
        {subtitle ? <p className="mt-2 ui-body-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

