import { useState } from "react";
import { Play, Pause, RotateCcw, Settings, ExternalLink, Activity, Globe, Server, MoreHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface TunnelStatusCardProps {
  tunnel: {
    id: string;
    name: string;
    domain: string;
    status: "running" | "stopped" | "error";
    uptime: string;
    requests: number;
    service: string;
    lastActivity: string;
  };
}

export function TunnelStatusCard({ tunnel }: TunnelStatusCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [currentOperation, setCurrentOperation] = useState<string | null>(null);
  const { toast } = useToast();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "bg-success/10 text-success border-success/20";
      case "stopped":
        return "bg-muted text-muted-foreground border-border";
      case "error":
        return "bg-destructive/10 text-destructive border-destructive/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const handleAction = async (action: string) => {
    if (isLoading || currentOperation) return; // Prevent multiple clicks
    
    setIsLoading(true);
    setCurrentOperation(action);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const response = await fetch(`/api/tunnels/${tunnel.id}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${action} tunnel`);
      }

      const result = await response.json();
      
      toast({
        title: "Success",
        description: `Tunnel ${action}ed successfully`,
        variant: "default",
        duration: 2000,
      });

      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (error) {
      console.error(`Error ${action}ing tunnel:`, error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : `Failed to ${action} tunnel`,
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setTimeout(() => {
        setIsLoading(false);
        setCurrentOperation(null);
      }, 1000);
    }
  };

  return (
    <Card className="transition-all duration-200 hover:shadow-card hover:-translate-y-1 bg-gradient-card border border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="font-semibold text-foreground">{tunnel.name}</h3>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Globe className="w-4 h-4" />
              <span>{tunnel.domain}</span>
              <ExternalLink className="w-3 h-3 cursor-pointer hover:text-foreground" />
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Badge 
              variant="outline" 
              className={cn("text-xs", getStatusColor(tunnel.status))}
            >
              <Activity className="w-3 h-3 mr-1" />
              {tunnel.status}
            </Badge>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Settings className="w-4 h-4 mr-2" />
                  Configurar
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Ver Logs
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive">
                  Deletar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Service Info */}
        <div className="flex items-center space-x-4 text-sm">
          <div className="flex items-center space-x-1">
            <Server className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Service:</span>
            <span className="font-medium">{tunnel.service}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Uptime</div>
            <div className="font-medium">{tunnel.uptime}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Requests</div>
            <div className="font-medium">{tunnel.requests.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Last Activity</div>
            <div className="font-medium">{tunnel.lastActivity}</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2 pt-2">
          {tunnel.status === "running" ? (
            <Button 
              size="sm" 
              variant="secondary"
              onClick={() => handleAction("stop")}
              disabled={isLoading || currentOperation === "stopping"}
              className="flex-1"
            >
              {currentOperation === "stopping" ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
              ) : (
                <Pause className="w-4 h-4 mr-2" />
              )}
              {currentOperation === "stopping" ? "Stopping..." : "Stop"}
            </Button>
          ) : (
            <Button 
              size="sm"
              onClick={() => handleAction("start")}
              disabled={isLoading || currentOperation === "starting"}
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              {currentOperation === "starting" ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              {currentOperation === "starting" ? "Starting..." : "Start"}
            </Button>
          )}
          
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => handleAction("restart")}
            disabled={isLoading || currentOperation === "restarting"}
          >
            {currentOperation === "restarting" ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}