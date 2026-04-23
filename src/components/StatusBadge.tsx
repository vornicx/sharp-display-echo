import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Estado = "Borrador" | "Analizado" | "Con descuadre" | "Validado";

const styles: Record<Estado, string> = {
  Borrador: "bg-muted text-muted-foreground border-border",
  Analizado: "bg-info/15 text-info border-info/30",
  "Con descuadre": "bg-destructive/15 text-destructive border-destructive/30",
  Validado: "bg-success/15 text-success border-success/30",
};

export const StatusBadge = ({ estado }: { estado: Estado | string }) => (
  <Badge variant="outline" className={cn("font-medium", styles[estado as Estado] ?? styles.Borrador)}>
    {estado}
  </Badge>
);
