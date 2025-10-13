import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Cloud, Settings, FileText, Activity, ChevronDown, Plus, Zap, Terminal, Globe, Wifi, WifiOff, Loader2, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useTunnelModal } from "@/contexts/TunnelModalContext";
import { useStatus } from "@/contexts/StatusContext";

const navigationItems = [
  {
    title: "Dashboard",
    href: "/",
    icon: Activity,
    description: "Tunnel overview"
  },
  {
    title: "Tunnels",
    href: "/tunnels",
    icon: Cloud,
    description: "Manage Cloudflare tunnels"
  },
  {
    title: "Accounts",
    href: "/accounts",
    icon: Globe,
    description: "Manage Cloudflare accounts"
  },
  {
    title: "Domains",
    href: "/domains",
    icon: Globe,
    description: "Manage DNS domains"
  },
  {
    title: "Config Editor",
    href: "/config",
    icon: FileText,
    description: "Edit config.yml",
    disabled: true
  },
  {
    title: "Terminal",
    href: "/terminal",
    icon: Terminal,
    description: "Cloudflared console",
    disabled: true
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
    description: "Credentials and preferences",
    disabled: true
  }
];

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const { status, isLoading, lastChecked, fetchStatus } = useStatus();
  const navigate = useNavigate();
  const { openCreateModal } = useTunnelModal();
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleNewTunnelClick = () => {
    if (location.pathname !== '/tunnels') {
      navigate('/tunnels');
    }
    openCreateModal();
  };


  return (
    <div className={cn(
      "h-screen bg-card border-r border-border flex flex-col",
      isCollapsed ? "w-16" : "w-72"
    )}>
      <div className="flex items-center justify-between p-4">
        {!isCollapsed && (
          <div>
            <div className="text-lg font-semibold tracking-tight">TunnelUI</div>
            <div className="text-xs text-muted-foreground">Manage Cloudflare Tunnels</div>
          </div>
        )}
        <Button variant="ghost" size="icon" onClick={onToggle}>
          <ChevronDown className={cn("w-5 h-5 transition-transform", isCollapsed ? "-rotate-90" : "rotate-0")} />
        </Button>
      </div>

      <Separator />

      {/* Quick Connect actions removed */}

      <nav className="flex-1 p-3 space-y-1 overflow-auto">
        {navigationItems.map((item) => {
          const isActive = location.pathname === item.href;
          const Icon = item.icon;

          if (item.disabled) {
            return (
              <div
                key={item.href}
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-lg text-muted-foreground opacity-50 cursor-not-allowed",
                  isActive && "bg-muted/50"
                )}
                title="Coming soon"
              >
                <Icon className="w-5 h-5" />
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {item.title}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {item.description}
                    </div>
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200",
                "hover:bg-muted/50 group",
                isActive && "bg-primary/10 text-primary border border-primary/20 shadow-sm",
                !isActive && "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn(
                "w-5 h-5 transition-colors",
                isActive && "text-primary"
              )} />
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {item.title}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {item.description}
                  </div>
                </div>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Compact Status Footer */}
      <div className="p-3 border-t border-border bg-muted/20">
        {!isCollapsed ? (
          <div className="space-y-2">
            {/* Status Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {isLoading ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Checking...</span>
                  </>
                ) : status?.installed ? (
                  <>
                    <CheckCircle className="w-3 h-3 text-green-500" />
                    <span className="text-xs font-medium text-green-600">Online</span>
                    {status.activeTunnels > 0 && (
                      <span className="text-xs text-muted-foreground">({status.activeTunnels})</span>
                    )}
                    {status.version && status.upToDate !== false && (
                      <span className="text-xs text-muted-foreground">• Up to date</span>
                    )}
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3 text-red-500" />
                    <span className="text-xs font-medium text-red-600">Offline</span>
                  </>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={() => fetchStatus(true)}
                disabled={isLoading}
              >
                <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
              </Button>
            </div>

            {/* Version & Update */}
            {!isLoading && status && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground flex items-center space-x-1">
                    <Terminal className="w-3 h-3" />
                    <span>{status.version ? `cloudflared v${status.version}` : 'Not installed'}</span>
                  </div>
                  {status.installed && status.version && status.upToDate === false && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-5 px-2 text-xs"
                      onClick={async () => {
                        try {
                          await fetch('/api/cloudflared/update', { method: 'POST' });
                          setTimeout(async () => {
                            await fetchStatus();
                          }, 3000);
                        } catch {}
                      }}
                    >
                      Update
                    </Button>
                  )}
                </div>
                
                {/* Update Status */}
                {status.installed && status.version && status.upToDate === false && (
                  <div className="flex items-center justify-between">
                    <div className="text-xs flex items-center space-x-1 text-amber-600">
                      <AlertCircle className="w-3 h-3" />
                      <span>Update available v{status.latestVersion || ''}</span>
                    </div>
                  </div>
                )}

                {/* Last Checked */}
                {lastChecked && (
                  <div className="text-xs text-muted-foreground/70">
                    Last checked: {lastChecked.toLocaleTimeString()}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex justify-center">
            {isLoading ? (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            ) : status?.installed ? (
              <CheckCircle className="w-3 h-3 text-green-500" />
            ) : (
              <AlertCircle className="w-3 h-3 text-red-500" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
