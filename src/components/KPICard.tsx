import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "default" | "primary" | "success" | "warning" | "destructive" | "info";
  hint?: string;
  icon?: ReactNode;
}

const toneClass: Record<NonNullable<Props["tone"]>, string> = {
  default: "text-foreground",
  primary: "text-primary-strong",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  info: "text-info",
};

export const KPICard = ({ label, value, unit, tone = "default", hint, icon }: Props) => (
  <Card className="p-5 bg-gradient-kpi border-border/60 shadow-card hover:shadow-elevated transition-shadow">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">{label}</p>
        <div className={cn("mt-2 flex items-baseline gap-1.5 kpi-number", toneClass[tone])}>
          <span className="text-2xl sm:text-3xl font-bold leading-none">{value}</span>
          {unit && <span className="text-sm font-medium opacity-70">{unit}</span>}
        </div>
        {hint && <p className="text-xs text-muted-foreground mt-2">{hint}</p>}
      </div>
      {icon && <div className="text-muted-foreground/60">{icon}</div>}
    </div>
  </Card>
);
