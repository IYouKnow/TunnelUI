import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function StatsCard({
  title, 
  value, 
  description, 
  icon, 
  trend, 
  className 
}: StatsCardProps) {
  return (
    <Card className={cn(
      "relative overflow-hidden transition-all duration-200 hover:shadow-card hover:-translate-y-1",
      "bg-gradient-card border border-border/50",
      className
    )}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="text-muted-foreground">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground mb-1">
          {value}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mb-2">
            {description}
          </p>
        )}
        {trend && (
          <div className="flex items-center text-xs">
            <span className={cn(
              "flex items-center font-medium",
              trend.isPositive ? "text-success" : "text-destructive"
            )}>
              {trend.isPositive ? "+" : ""}{trend.value}%
            </span>
            <span className="text-muted-foreground ml-1">
              desde o último mês
            </span>
          </div>
        )}
      </CardContent>
      
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
    </Card>
  );
}