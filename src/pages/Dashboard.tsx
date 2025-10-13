import { Cloud, Activity, Globe, Zap, TrendingUp, Clock, AlertTriangle, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { TunnelStatusCard } from "@/components/dashboard/TunnelStatusCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTunnelModal } from "@/contexts/TunnelModalContext";
import { useNavigate } from "react-router-dom";

type DashboardTunnel = {
  id: string;
  name: string;
  domain: string;
  status: "running" | "stopped" | "error";
  uptime: string;
  requests: number;
  service: string;
  lastActivity: string;
};

type SystemStatus = {
  installed: boolean;
  version: string | null;
  latestVersion?: string | null;
  upToDate?: boolean;
  activeTunnels: number;
};

const buildServiceUrl = (t: any) => {
  const protocol = t?.serviceProtocol || t?.service_protocol || "http";
  const host = t?.serviceHost || t?.service_host || t?.host || "localhost";
  const port = t?.servicePort || t?.service_port || t?.port;
  if (port) return `${protocol}://${host}:${port}`;
  return `${protocol}://${host}`;
};

const Dashboard = () => {
  const { openCreateModal } = useTunnelModal();
  const navigate = useNavigate();
  const [tunnels, setTunnels] = useState<DashboardTunnel[]>([]);
  const [tunnelsLoading, setTunnelsLoading] = useState<boolean>(true);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [activity, setActivity] = useState<Array<{ level: "success" | "primary" | "warning" | "muted"; title: string; subtitle: string; timestamp: string; tunnel: DashboardTunnel }>>([]);
  const [recentTunnel, setRecentTunnel] = useState<DashboardTunnel | null>(null);
  const [previousTunnelStates, setPreviousTunnelStates] = useState<{ [id: string]: string }>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setTunnelsLoading(true);
      try {
        const res = await fetch("/api/tunnels");
        const rows = await res.json();
        const mapped: DashboardTunnel[] = Array.isArray(rows) ? rows.map((t: any) => {
          // Calculate uptime for running tunnels
          let uptime = "—";
          if (t.uptime_started_at) {
            const uptimeStartDate = new Date(t.uptime_started_at);
            const now = new Date();
            const uptimeSeconds = Math.floor((now.getTime() - uptimeStartDate.getTime()) / 1000);
            
            if (uptimeSeconds > 0) {
              const days = Math.floor(uptimeSeconds / 86400);
              const hours = Math.floor((uptimeSeconds % 86400) / 3600);
              const minutes = Math.floor((uptimeSeconds % 3600) / 60);
              
              if (days > 0) uptime = `${days}d`;
              else if (hours > 0) uptime = `${hours}h`;
              else if (minutes > 0) uptime = `${minutes}m`;
              else uptime = "1m";
            }
          }
          
          // Calculate last activity
          let lastActivity = "—";
          if (t.last_activity_at) {
            const date = new Date(t.last_activity_at);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffSeconds = Math.floor(diffMs / 1000);
            const diffMinutes = Math.floor(diffSeconds / 60);
            const diffHours = Math.floor(diffMinutes / 60);
            const diffDays = Math.floor(diffHours / 24);
            
            if (diffDays > 0) lastActivity = `${diffDays}d ago`;
            else if (diffHours > 0) lastActivity = `${diffHours}h ago`;
            else if (diffMinutes > 0) lastActivity = `${diffMinutes}m ago`;
            else if (diffSeconds > 0) lastActivity = `${diffSeconds}s ago`;
            else lastActivity = "Just now";
          }
          
          return {
            id: String(t.id ?? t.cloudflare_id ?? Math.random()),
            name: t.name || t.tunnel_name || "Tunnel",
            domain: t.full_domain || t.domain || t.hostname || "",
            status: "stopped",
            uptime,
            requests: Number(t.requests || 0),
            service: t.service || buildServiceUrl(t),
            lastActivity,
          };
        }) : [];
        const withStatuses = await Promise.all(mapped.map(async (t) => {
          try {
            const s = await fetch(`/api/tunnels/${t.id}/status`).then(r => r.ok ? r.json() : { status: "unknown" });
            return { ...t, status: (s.status === "running" || s.status === "stopped") ? s.status : "stopped" } as DashboardTunnel;
          } catch {
            return { ...t } as DashboardTunnel;
          }
        }));
        if (!cancelled) {
          setTunnels(withStatuses);
          
          const currentStates: { [id: string]: string } = {};
          let mostRecentChange: { tunnel: DashboardTunnel; change: string } | null = null;
          
          withStatuses.forEach(tunnel => {
            currentStates[tunnel.id] = tunnel.status;
            const previousStatus = previousTunnelStates[tunnel.id];
            
            if (previousStatus && previousStatus !== tunnel.status) {
              if (tunnel.status === "running" && previousStatus === "stopped") {
                mostRecentChange = { tunnel, change: "started" };
              } else if (tunnel.status === "stopped" && previousStatus === "running") {
                mostRecentChange = { tunnel, change: "stopped" };
              }
            }
          });
          
          if (mostRecentChange) {
            setRecentTunnel(mostRecentChange.tunnel);
          } else if (withStatuses.length > 0) {
            const runningTunnels = withStatuses.filter(t => t.status === "running");
            setRecentTunnel(runningTunnels.length > 0 ? runningTunnels[0] : withStatuses[0]);
          }
          
          setPreviousTunnelStates(currentStates);
        }
      } catch {
        if (!cancelled) setTunnels([]);
      } finally {
        if (!cancelled) setTunnelsLoading(false);
      }
    }
    load();
    const id = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      try {
        const res = await fetch("/api/status");
        const data: SystemStatus = await res.json();
        if (!cancelled) setSystemStatus(data);
      } catch {
        if (!cancelled) setSystemStatus({ installed: false, version: null, latestVersion: null, upToDate: true, activeTunnels: 0 });
      }
    }
    loadStatus();
    const id = setInterval(loadStatus, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);


  useEffect(() => {
    let cancelled = false;
    async function loadActivity() {
      try {
        const targets = tunnels;
        const logs = await Promise.all(targets.map(async (t) => {
          try {
            const r = await fetch(`/api/tunnels/${t.id}/logs`);
            if (!r.ok) return [];
            const j = await r.json();
            const logLines = String(j?.logs || "").split("\n").filter(line => line.trim());
            return logLines.slice(-20).map((line: string, index: number) => ({ 
              line, 
              tunnel: t, 
              timestamp: new Date(Date.now() - (logLines.length - index) * 1000).toISOString(),
              originalIndex: logLines.length - index
            }));
          } catch {
            return [] as any[];
          }
        }));
        
        const flat = logs.flat().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        
        // Parse activities with better event detection
        const parsed = flat.slice(0, 4).map(({ line, tunnel, timestamp }: any) => {
          const lower = String(line).toLowerCase();
          let level: "success" | "primary" | "warning" | "muted" = "muted";
          let title = "Activity";
          
          // Enhanced event detection
          if (lower.includes("started") || lower.includes("running") || lower.includes("connected")) { 
            level = "success"; 
            title = "Tunnel Started"; 
          }
          else if (lower.includes("stopped") || lower.includes("disconnected") || lower.includes("shutdown")) { 
            level = "warning"; 
            title = "Tunnel Stopped"; 
          }
          else if (lower.includes("config") || lower.includes("policy") || lower.includes("configuration")) { 
            level = "primary"; 
            title = "Configuration Updated"; 
          }
          else if (lower.includes("restart") || lower.includes("restarted")) { 
            level = "primary"; 
            title = "Tunnel Restarted"; 
          }
          else if (lower.includes("error") || lower.includes("failed") || lower.includes("exception")) { 
            level = "warning"; 
            title = "Error Occurred"; 
          }
          else if (lower.includes("request") || lower.includes("traffic")) { 
            level = "success"; 
            title = "Traffic Activity"; 
          }
          else if (lower.includes("health") || lower.includes("check")) { 
            level = "primary"; 
            title = "Health Check"; 
          }
          
          const timeAgo = new Date(timestamp);
          const now = new Date();
          const diffMs = now.getTime() - timeAgo.getTime();
          const diffMins = Math.floor(diffMs / 60000);
          const diffHours = Math.floor(diffMins / 60);
          const diffDays = Math.floor(diffHours / 24);
          
          let timeStr = "Just now";
          if (diffMins < 1) timeStr = "Just now";
          else if (diffMins < 60) timeStr = `${diffMins}m ago`;
          else if (diffHours < 24) timeStr = `${diffHours}h ago`;
          else timeStr = `${diffDays}d ago`;
          
          return {
            level,
            title,
            subtitle: `${tunnel.domain || tunnel.name} • ${timeStr}`,
            timestamp,
            tunnel
          };
        });
        
        if (!cancelled) {
          setActivity(parsed);
        }
      } catch {
        if (!cancelled) setActivity([]);
      }
    }
    if (tunnels.length) {
      loadActivity();
      const id = setInterval(loadActivity, 20000);
      return () => { cancelled = true; clearInterval(id); };
    }
  }, [tunnels]);

  const activeTunnelCount = useMemo(() => tunnels.filter(t => t.status === "running").length, [tunnels]);
  
  const connectedDomainsCount = useMemo(() => {
    const uniqueDomains = new Set(tunnels.map(t => t.domain).filter(Boolean));
    return uniqueDomains.size;
  }, [tunnels]);
  
  const averageUptime = useMemo(() => {
    const runningTunnels = tunnels.filter(t => t.status === "running");
    if (runningTunnels.length === 0) return "0%";
    
    // For now, we'll use a simple calculation based on running tunnels
    // In a real implementation, you'd calculate actual uptime percentages
    const uptimePercentage = (runningTunnels.length / tunnels.length) * 100;
    return `${uptimePercentage.toFixed(1)}%`;
  }, [tunnels]);

  const handleNewTunnelClick = () => {
    if (window.location.pathname !== '/tunnels') {
      navigate('/tunnels');
    }
    openCreateModal();
  };
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="text-muted-foreground">
            Overview of your Cloudflare tunnels
          </p>
        </div>
        
        <Button className="bg-primary hover:bg-primary/90 shadow-primary" onClick={handleNewTunnelClick}>
          <Plus className="w-4 h-4 mr-2" />
          New Tunnel
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Active Tunnels"
          value={activeTunnelCount}
          description={tunnelsLoading ? "loading..." : `of ${tunnels.length} tunnels configured`}
          icon={<Cloud className="w-4 h-4" />}
          trend={{ value: 12, isPositive: true }}
        />
        
        <StatsCard
          title="Total Requests"
          value="215.2K"
          description="last 24 hours"
          icon={<Activity className="w-4 h-4" />}
          trend={{ value: 8, isPositive: true }}
        />
        
        <StatsCard
          title="Connected Domains"
          value={connectedDomainsCount}
          description="with SSL/TLS active"
          icon={<Globe className="w-4 h-4" />}
        />
        
        <StatsCard
          title="Average Uptime"
          value={averageUptime}
          description="based on running tunnels"
          icon={<TrendingUp className="w-4 h-4" />}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Tunnel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">
              Recent Tunnel
            </h2>
            <Button variant="outline" size="sm">
              View All
            </Button>
          </div>
          
          <div className="grid gap-4">
            {tunnelsLoading ? (
              <div className="text-sm text-muted-foreground">Loading tunnels...</div>
            ) : tunnels.length ? (
              (() => {
                const t = recentTunnel ?? tunnels[0];
                return <TunnelStatusCard key={t.id} tunnel={t} />;
              })()
            ) : (
              <div className="text-sm text-muted-foreground">No tunnels found.</div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Recent Activity */}
          <Card className="bg-gradient-card border border-border/50 min-h-[298px]">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="w-5 h-5" />
                <span>Recent Activity</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {activity.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No recent activity.</div>
                ) : (
                  activity.map((evt, idx) => (
                    <div key={idx} className="flex items-start space-x-3">
                      <div className={"w-2 h-2 rounded-full mt-2 " + (evt.level === "success" ? "bg-success" : evt.level === "warning" ? "bg-warning" : evt.level === "primary" ? "bg-primary" : "bg-muted-foreground") } />
                      <div className="text-sm">
                        <div className="font-medium">{evt.title}</div>
                        <div className="text-muted-foreground">{evt.subtitle}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* System Status (moved above, so remove this duplicate if present) */}
          {/* Removed duplicate System Status card */}
          {/* Quick Actions removed */}
          {false && (
          <Card className="bg-gradient-card border border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Zap className="w-5 h-5" />
                <span>System Status</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Cloudflared</span>
                  <div className="flex items-center space-x-2">
                    <div className={"w-2 h-2 rounded-full " + (systemStatus?.installed ? "bg-success" : "bg-warning") } />
                    <span className={"text-sm " + (systemStatus?.installed ? "text-success" : "text-warning") }>{systemStatus?.installed ? "Installed" : "Not installed"}</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm">Cloudflare API</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-success" />
                    <span className="text-sm text-success">Connected</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm">Configuration</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-success" />
                    <span className="text-sm text-success">Valid</span>
                  </div>
                </div>
              </div>
              
              <div className="pt-2 border-t border-border text-xs text-muted-foreground">
                Version: {systemStatus?.version ? `cloudflared ${systemStatus.version}` : "unknown"}
              </div>
            </CardContent>
          </Card>
          )}

          {/* Quick Actions removed */}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;