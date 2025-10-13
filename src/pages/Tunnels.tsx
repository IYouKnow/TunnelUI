import { useState, useEffect } from "react";
import { Plus, Search, Filter, Download, Upload, Play, Pause, RotateCcw, Settings, Trash2, ExternalLink, Activity, Globe, Server, Clock, AlertTriangle, FileKey, Check } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { useTunnelModal } from "@/contexts/TunnelModalContext";

// Utility functions for formatting time
const formatUptime = (tunnel: any, tunnelStatus: string) => {
  // Only show uptime for running tunnels
  if (tunnelStatus !== 'running') return '-';
  
  // Use uptime_started_at for real uptime tracking
  if (!tunnel.uptime_started_at) return '-';
  
  const uptimeStartDate = new Date(tunnel.uptime_started_at);
  const now = new Date();
  const uptimeSeconds = Math.floor((now.getTime() - uptimeStartDate.getTime()) / 1000);
  
  if (uptimeSeconds <= 0) return '1m'; // Minimum 1 minute for running tunnels
  
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return '1m'; // Minimum 1 minute for running tunnels
};

const formatUptimeDetailed = (tunnel: any, tunnelStatus: string) => {
  if (tunnelStatus !== 'running') return 'Not running';
  
  if (!tunnel.uptime_started_at) return 'No uptime data available';
  
  const uptimeStartDate = new Date(tunnel.uptime_started_at);
  const now = new Date();
  const uptimeSeconds = Math.floor((now.getTime() - uptimeStartDate.getTime()) / 1000);
  
  if (uptimeSeconds <= 0) return 'Just started';
  
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeSeconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  
  return parts.length > 0 ? parts.join(' ') : '1s';
};

const formatLastActivity = (tunnel: any) => {
  // Use last_activity_at for real last activity tracking
  if (!tunnel.last_activity_at) return '-';
  
  const date = new Date(tunnel.last_activity_at);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMinutes > 0) return `${diffMinutes}m ago`;
  if (diffSeconds > 0) return `${diffSeconds}s ago`;
  return 'Just now';
};

const formatLastActivityDetailed = (tunnel: any) => {
  if (!tunnel.last_activity_at) return 'No activity data available';
  
  const date = new Date(tunnel.last_activity_at);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

interface Account {
  id: number;
  name: string;
  description?: string;
}

const API_URL = "http://192.168.1.29:3001";

const Tunnels = () => {
  const { toast } = useToast();
  const { isCreateModalOpen, closeCreateModal, openCreateModal } = useTunnelModal();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [tunnelState, setTunnelState] = useState({
    tunnels: [],
    loading: true,
    error: null,
    toDelete: null,
    deleting: false,
    editing: null,
  });

  const [accountState, setAccountState] = useState({
    accounts: [],
    loading: true,
    error: null,
  });

  const [domainState, setDomainState] = useState({
    domains: [],
    selected: "",
    subdomain: "",
  });

  const [tunnelOperations, setTunnelOperations] = useState<{ [id: number]: 'starting' | 'stopping' }>({});

  const [newTunnel, setNewTunnel] = useState({
    name: "",
    domain: "",
    serviceHost: "",
    servicePort: "",
    serviceProtocol: "http",
    accountId: "",
    creating: false,
    error: null,
    noTLSVerify: false,
  });

  const [nameCheck, setNameCheck] = useState({
    checking: false,
    available: true,
    message: ''
  });

  const [dnsDialog, setDnsDialog] = useState({
    show: false,
    pendingTunnel: null,
    pendingFullDomain: "",
    pendingMessage: "",
    cleanupLoading: false,
  });

  const [editDnsDialog, setEditDnsDialog] = useState({
    show: false,
    pendingTunnel: null,
    pendingFullDomain: "",
    pendingMessage: "",
    cleanupLoading: false,
    actionLoading: "", // Track which action is loading: "proceed" or "replace"
  });

  const [editDialog, setEditDialog] = useState({
    show: false,
    tunnel: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (isCreateModalOpen) {
      setTimeout(() => {
        if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "SELECT")) {
          (document.activeElement as HTMLElement).blur();
        }
      }, 100);
    }
  }, [isCreateModalOpen]);

  useEffect(() => {
    fetch(`${API_URL}/api/accounts`)
      .then((res) => {
        if (!res.ok) throw new Error("Error fetching accounts");
        return res.json();
      })
      .then((data) => {
        setAccountState(prev => ({ ...prev, accounts: data }));
        setAccountState(prev => ({ ...prev, loading: false }));
      })
      .catch((err) => {
        setAccountState(prev => ({ ...prev, error: err.message }));
        setAccountState(prev => ({ ...prev, loading: false }));
      });
    fetch(`${API_URL}/api/domains`)
      .then(res => res.json())
      .then(data => setDomainState(prev => ({ ...prev, domains: data })));
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/api/tunnels`)
      .then(res => {
        if (!res.ok) throw new Error('Error fetching tunnels');
        return res.json();
      })
      .then(data => {
        setTunnelState(prev => ({ ...prev, tunnels: data }));
        setTunnelState(prev => ({ ...prev, loading: false }));
      })
      .catch(err => {
        setTunnelState(prev => ({ ...prev, error: err.message }));
        setTunnelState(prev => ({ ...prev, loading: false }));
      });
  }, []);

  const afterCreateTunnel = () => {
    setTunnelState(prev => ({ ...prev, loading: true }));
    fetch(`${API_URL}/api/tunnels`)
      .then(res => res.json())
      .then(data => {
        setTunnelState(prev => ({ ...prev, tunnels: data }));
        setTunnelState(prev => ({ ...prev, loading: false }));
      });
  };

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <Activity className="w-3 h-3" />;
      case "stopped":
        return <Pause className="w-3 h-3" />;
      case "error":
        return <ExternalLink className="w-3 h-3" />;
      default:
        return <Activity className="w-3 h-3" />;
    }
  };

  const filteredTunnels = tunnelState.tunnels.filter(tunnel => {
    const matchesSearch = tunnel.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tunnel.domain.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === "all" || tunnel.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const handleCreateTunnel = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewTunnel(prev => ({ ...prev, creating: true }));
    setNewTunnel(prev => ({ ...prev, error: null }));
    let fullDomain = domainState.selected;
    if (domainState.subdomain.trim()) {
      fullDomain = `${domainState.subdomain.trim()}.${domainState.selected}`;
    }
    const service = `${newTunnel.serviceProtocol}://${newTunnel.serviceHost}${newTunnel.servicePort ? `:${newTunnel.servicePort}` : ''}`;
    try {
      const res = await fetch(`${API_URL}/api/tunnels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTunnel.name,
          domain: fullDomain,
          service,
          account_id: newTunnel.accountId,
          status: 'stopped',
          noTLSVerify: newTunnel.noTLSVerify,
        })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.dnsRecordExists) {
          setDnsDialog(prev => ({
            ...prev,
            pendingTunnel: {
              ...newTunnel,
              tunnelId: data.tunnelId,
              name: newTunnel.name,
              accountId: newTunnel.accountId,
            },
            pendingFullDomain: fullDomain,
            pendingMessage: data.message || 'A DNS record with this name already exists. Do you want to proceed anyway?',
            show: true
          }));
          setNewTunnel(prev => ({ ...prev, creating: false }));
          return;
        }
        setNewTunnel(prev => ({ ...prev, error: data.error || 'Error adding tunnel.' }));
        setNewTunnel(prev => ({ ...prev, creating: false }));
        return;
      }
      closeCreateModal();
      setNewTunnel({ name: '', domain: '', serviceHost: '', servicePort: '', serviceProtocol: 'http', accountId: '', creating: false, error: null, noTLSVerify: false });
      setDomainState(prev => ({ ...prev, selected: '', subdomain: '' }));
      afterCreateTunnel();
      toast({ title: 'Success', description: 'Tunnel created successfully!', variant: 'default', duration: 2000 });
    } catch (err: any) {
      setNewTunnel(prev => ({ ...prev, error: err.message || 'Error adding tunnel.' }));
      setNewTunnel(prev => ({ ...prev, creating: false }));
    }
  };

  const handleForceCreateTunnel = (replaceDns: boolean) => async () => {
    setNewTunnel(prev => ({ ...prev, creating: true }));
    try {
      const service = `${dnsDialog.pendingTunnel.serviceProtocol || 'http'}://${dnsDialog.pendingTunnel.serviceHost}${dnsDialog.pendingTunnel.servicePort ? `:${dnsDialog.pendingTunnel.servicePort}` : ''}`;
      const forceRes = await fetch(`${API_URL}/api/tunnels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: dnsDialog.pendingTunnel.name,
          domain: dnsDialog.pendingFullDomain,
          service,
          account_id: dnsDialog.pendingTunnel.accountId,
          status: 'stopped',
          force: true,
          tunnelId: dnsDialog.pendingTunnel.tunnelId,
          replaceDns: replaceDns,
          noTLSVerify: dnsDialog.pendingTunnel.noTLSVerify,
        })
      });
      const forceData = await forceRes.json();
      if (!forceRes.ok) {
        setNewTunnel(prev => ({ ...prev, error: forceData.error || 'Error adding tunnel.' }));
        setNewTunnel(prev => ({ ...prev, creating: false }));
        setDnsDialog(prev => ({ ...prev, show: false }));
        return;
      }
      closeCreateModal();
      setDnsDialog(prev => ({ ...prev, show: false }));
      setNewTunnel({ name: '', domain: '', serviceHost: '', servicePort: '', serviceProtocol: 'http', accountId: '', creating: false, error: null, noTLSVerify: false });
      setDomainState(prev => ({ ...prev, selected: '', subdomain: '' }));
      afterCreateTunnel();
      toast({ title: 'Success', description: 'Tunnel created successfully!', variant: 'default', duration: 2000 });
    } finally {
      setNewTunnel(prev => ({ ...prev, creating: false }));
    }
  };

  const handleForceUpdateTunnel = (replaceDns: boolean) => async () => {
    setEditDialog(prev => ({ ...prev, loading: true }));
    setEditDnsDialog(prev => ({ ...prev, actionLoading: replaceDns ? "replace" : "proceed" }));
    try {
      const service = `${editDnsDialog.pendingTunnel.serviceProtocol || 'http'}://${editDnsDialog.pendingTunnel.serviceHost}${editDnsDialog.pendingTunnel.servicePort ? `:${editDnsDialog.pendingTunnel.servicePort}` : ''}`;
      const forceRes = await fetch(`${API_URL}/api/tunnels/${editDnsDialog.pendingTunnel.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editDnsDialog.pendingTunnel.name,
          domain: editDnsDialog.pendingFullDomain,
          service,
          account_id: editDnsDialog.pendingTunnel.accountId,
          force: true,
          replaceDns: replaceDns,
          noTLSVerify: editDnsDialog.pendingTunnel.no_tls_verify,
        })
      });
      const forceData = await forceRes.json();
      if (!forceRes.ok) {
        setEditDialog(prev => ({ ...prev, error: forceData.error || 'Error updating tunnel.' }));
        setEditDialog(prev => ({ ...prev, loading: false }));
        setEditDnsDialog(prev => ({ ...prev, show: false, actionLoading: "" }));
        return;
      }
      setEditDialog(prev => ({ ...prev, show: false }));
      setEditDnsDialog(prev => ({ ...prev, show: false, actionLoading: "" }));
      afterCreateTunnel();
      toast({ title: 'Success', description: 'Tunnel updated successfully!', variant: 'default', duration: 2000 });
    } finally {
      setEditDialog(prev => ({ ...prev, loading: false }));
      setEditDnsDialog(prev => ({ ...prev, actionLoading: "" }));
    }
  };

  const handleStartTunnel = async (id: number) => {
    if (tunnelOperations[id]) return;
    
    setTunnelOperations(prev => ({ ...prev, [id]: 'starting' }));
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await fetch(`${API_URL}/api/tunnels/${id}/start`, { method: 'POST' });
      afterCreateTunnel(); // Update list/status
    } catch (err) {
      toast({ 
        title: 'Error', 
        description: 'Error starting tunnel', 
        variant: 'destructive', 
        duration: 3000 
      });
    } finally {
      setTimeout(() => {
        setTunnelOperations(prev => ({ ...prev, [id]: undefined }));
      }, 1000);
    }
  };

  const handleStopTunnel = async (id: number) => {
    if (tunnelOperations[id]) return;
    
    setTunnelOperations(prev => ({ ...prev, [id]: 'stopping' }));
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await fetch(`${API_URL}/api/tunnels/${id}/stop`, { method: 'POST' });
      afterCreateTunnel(); // Update list/status
    } catch (err) {
      toast({ 
        title: 'Error', 
        description: 'Error stopping tunnel', 
        variant: 'destructive', 
        duration: 3000 
      });
    } finally {
      setTimeout(() => {
        setTunnelOperations(prev => ({ ...prev, [id]: undefined }));
      }, 1000);
    }
  };

  // Add functions to activate/deactivate systemd
  const handleActivateSystemd = async (id: number) => {
    try {
      await fetch(`${API_URL}/api/tunnels/${id}/systemd`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      await fetch(`${API_URL}/api/tunnels/${id}/activate-systemd`, { method: 'POST' });
      afterCreateTunnel();
      alert('Systemd service activated and started successfully!');
    } catch (err) {
      alert('Error activating systemd service');
    }
  };

  const handleDeactivateSystemd = async (id: number) => {
    try {
      await fetch(`${API_URL}/api/tunnels/${id}/deactivate-systemd`, { method: 'DELETE' });
      await fetch(`${API_URL}/api/tunnels/${id}/systemd`, { method: 'DELETE' });
      afterCreateTunnel();
      alert('Systemd service deactivated and removed successfully!');
    } catch (err) {
      alert('Error deactivating/removing systemd service');
    }
  };

  // Update fetchTunnelStatus to use only the backend
  const fetchTunnelStatus = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/api/tunnels/${id}/status`);
      if (!res.ok) return 'unknown';
      const data = await res.json();
      return data.status || 'unknown';
    } catch {
      return 'unknown';
    }
  };

  // Update useEffect to fetch tunnel statuses
  const [tunnelStatuses, setTunnelStatuses] = useState<{ [id: number]: string }>({});
  
  useEffect(() => {
    if (!tunnelState.tunnels.length) return;
    const fetchAllStatuses = async () => {
      const statuses: { [id: number]: string } = {};
      await Promise.all(tunnelState.tunnels.map(async (tunnel) => {
        statuses[tunnel.id] = await fetchTunnelStatus(tunnel.id);
      }));
      setTunnelStatuses(statuses);
    };
    fetchAllStatuses();
  }, [tunnelState.tunnels]);

  // Add real-time updates for uptime and last activity
  const [, forceUpdate] = useState({});
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate({}); // Force re-render to update time displays
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, []);

  // Function to delete tunnel
  const handleDeleteTunnel = async (id: number) => {
    setTunnelState(prev => ({ ...prev, deleting: true }));
    try {
      const res = await fetch(`${API_URL}/api/tunnels/${id}`, { method: 'DELETE' });
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        data = { error: await res.text() };
      }
      if (!res.ok) {
        alert(data.error || 'Error deleting tunnel.');
        setTunnelState(prev => ({ ...prev, deleting: false }));
        return;
      }
      afterCreateTunnel();
      setTunnelState(prev => ({ ...prev, toDelete: null }));
      toast({ title: 'Success', description: 'Tunnel deleted successfully!', variant: 'default', duration: 2000 });
      if (data.dnsRecordWarning) {
        toast({
          title: 'Attention',
          description: data.dnsRecordWarning,
          variant: 'destructive',
          duration: 2000,
        });
      }
    } catch (err: any) {
      alert(err.message || 'Error deleting tunnel.');
    } finally {
      setTunnelState(prev => ({ ...prev, deleting: false }));
    }
  };

  // Function to open/close new tunnel modal and clear fields
  const handleShowDialog = (open: boolean) => {
    if (open) {
      openCreateModal();
      return;
    }
    closeCreateModal();
    setNewTunnel({ name: '', domain: '', serviceHost: '', servicePort: '', serviceProtocol: 'http', accountId: '', creating: false, error: null, noTLSVerify: false });
    setDomainState(prev => ({ ...prev, selected: '', subdomain: '' }));
    setNameCheck({ checking: false, available: true, message: '' });
  };

  const handleNameCheck = (name: string, accountId: string) => {
    if (name.length < 3) {
      setNameCheck({ checking: false, available: false, message: 'Name must be at least 3 characters long.' });
      return;
    }
    if (!accountId) {
      setNameCheck({ checking: false, available: false, message: 'Please select an account first.' });
      return;
    }
    setNameCheck(prev => ({ ...prev, checking: true }));
    // Debounce function
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/tunnels/check-name?name=${name}&account_id=${accountId}`);
        const data = await res.json();
        if (res.ok) {
          setNameCheck({ checking: false, available: !data.exists, message: data.message || '' });
        } else {
          setNameCheck({ checking: false, available: false, message: data.error || 'Error checking name.' });
        }
      } catch (err) {
        setNameCheck({ checking: false, available: false, message: 'Could not connect to the server.' });
      }
    }, 500);
    return () => clearTimeout(timer);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setNewTunnel(prev => ({ ...prev, name }));
    handleNameCheck(name, newTunnel.accountId);
  };

  const handleAccountChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const accountId = e.target.value;
    setNewTunnel(prev => ({ ...prev, accountId }));
    if (newTunnel.name.length >= 3) {
      handleNameCheck(newTunnel.name, accountId);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Manage Tunnels
            </h1>
            <p className="text-muted-foreground">
              Configure and monitor your Cloudflare tunnels
            </p>
          </div>
          
          <div className="flex space-x-2">
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button variant="outline">
              <Upload className="w-4 h-4 mr-2" />
              Import
            </Button>
            <Button className="bg-primary hover:bg-primary/90 shadow-primary" onClick={() => handleShowDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Tunnel
            </Button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-gradient-card border border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <Activity className="w-5 h-5 text-success" />
                <div>
                  <div className="text-2xl font-bold text-foreground">
                    {tunnelState.tunnels.filter(t => 
                      (tunnelStatuses[t.id] || t.status) === 'running'
                    ).length}
                  </div>
                  <div className="text-sm text-muted-foreground">Active</div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-card border border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <Pause className="w-5 h-5 text-muted-foreground" />
                <div>
                  <div className="text-2xl font-bold text-foreground">
                    {tunnelState.tunnels.filter(t => 
                      (tunnelStatuses[t.id] || t.status) === 'stopped'
                    ).length}
                  </div>
                  <div className="text-sm text-muted-foreground">Stopped</div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-card border border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <Globe className="w-5 h-5 text-primary" />
                <div>
                  <div className="text-2xl font-bold text-foreground">
                    {tunnelState.tunnels.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Total</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search tunnels..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Filter className="w-4 h-4 mr-2" />
                Filter by Status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setFilterStatus("all")}>All</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterStatus("running")}>Active</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterStatus("stopped")}>Stopped</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterStatus("error")}>With Error</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Tunnels Table */}
        <Card className="bg-gradient-card border border-border/50">
          <CardHeader>
            <CardTitle>Configured Tunnels</CardTitle>
          </CardHeader>
          <CardContent>
            {tunnelState.loading ? (
              <div>Loading tunnels...</div>
            ) : tunnelState.error ? (
              <div className="text-destructive">{tunnelState.error}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name / Domain</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Uptime</TableHead>
                    <TableHead>Requests</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTunnels.map((tunnel) => (
                    <TableRow key={tunnel.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div>
                          <div className="font-medium text-foreground">{tunnel.name}</div>
                          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                            <Globe className="w-3 h-3" />
                            <TooltipProvider delayDuration={100}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a 
                                    href={`https://${tunnel.domain}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center space-x-1 hover:text-primary transition-colors cursor-pointer"
                                  >
                                    <span>{tunnel.domain}</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                  <p>Open tunnel URL in new tab</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <Badge variant="outline" className="text-xs">{tunnel.service.startsWith('https') ? 'HTTPS' : 'HTTP'}</Badge>
                            {tunnel.dns_warning && (
                              <TooltipProvider delayDuration={100}>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom">
                                    <p className="text-orange-500">{tunnel.dns_warning}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {!!tunnel.no_tls_verify && (
                              <TooltipProvider delayDuration={100}>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <FileKey className="w-4 h-4 text-red-500" />
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom">
                                    <p className="text-red-500">TLS certificate validation is disabled for this tunnel.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("text-xs", getStatusColor(tunnelStatuses[tunnel.id] || tunnel.status))}
                        >
                          {getStatusIcon(tunnelStatuses[tunnel.id] || tunnel.status)}
                          <span className="ml-1 capitalize">{tunnelStatuses[tunnel.id] || tunnel.status || 'stopped'}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2 text-sm">
                          <Server className="w-3 h-3 text-muted-foreground" />
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a 
                                  href={tunnel.service}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center space-x-1 hover:text-primary transition-colors cursor-pointer font-mono"
                                >
                                  <span>{tunnel.service}</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                <p>Open local service in new tab</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2 text-sm">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">
                                  {formatUptime(tunnel, tunnelStatuses[tunnel.id] || tunnel.status)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                <p>{formatUptimeDetailed(tunnel, tunnelStatuses[tunnel.id] || tunnel.status)}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">
                          {(tunnel.requests ?? 0).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm text-muted-foreground cursor-help">
                                {formatLastActivity(tunnel)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              <p>{formatLastActivityDetailed(tunnel)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end space-x-1">
                          {tunnelStatuses[tunnel.id] === "running" ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    onClick={() => handleStopTunnel(tunnel.id)} 
                                    disabled={!!tunnelOperations[tunnel.id]}
                                  >
                                    {tunnelOperations[tunnel.id] === 'stopping' ? (
                                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <Pause className="w-4 h-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{tunnelOperations[tunnel.id] === 'stopping' ? 'Stopping...' : 'Stop tunnel'}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    onClick={() => handleStartTunnel(tunnel.id)} 
                                    disabled={!!tunnelOperations[tunnel.id]}
                                  >
                                    {tunnelOperations[tunnel.id] === 'starting' ? (
                                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <Play className="w-4 h-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{tunnelOperations[tunnel.id] === 'starting' ? 'Starting...' : 'Start tunnel'}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="outline" onClick={() => handleActivateSystemd(tunnel.id)}>
                                  <Server className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Activate systemd service</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="outline" onClick={() => handleDeactivateSystemd(tunnel.id)}>
                                  <RotateCcw className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Deactivate systemd service</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="outline">
                                <Settings className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => {
                                // Correctly split domain into subdomain and main domain
                                const firstDot = tunnel.domain.indexOf('.');
                                const subdomain = firstDot > 0 ? tunnel.domain.slice(0, firstDot) : '';
                                const domain = firstDot > 0 ? tunnel.domain.slice(firstDot + 1) : tunnel.domain;
                                setEditDialog({
                                  show: true,
                                  tunnel: {
                                    ...tunnel,
                                    domain: domain,
                                    subdomain: subdomain,
                                    serviceProtocol: tunnel.service.startsWith('https') ? 'https' : 'http',
                                    serviceHost: tunnel.service.split('://')[1].split(':')[0],
                                    servicePort: tunnel.service.includes(':') 
                                      ? tunnel.service.split(':')[2].split('/')[0] 
                                      : tunnel.service.startsWith('https') ? '443' : '80'
                                  },
                                  loading: false,
                                  error: null
                                });
                              }}>
                                <Settings className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Activity className="w-4 h-4 mr-2" />
                                View Logs
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Download className="w-4 h-4 mr-2" />
                                Export Config
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => setTunnelState(prev => ({ ...prev, toDelete: tunnel }))} disabled={tunnelState.deleting}>
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Dialog open={isCreateModalOpen} onOpenChange={handleShowDialog}>
          <DialogContent className="max-w-xl rounded-xl bg-card border border-border shadow-xl p-0">
            <DialogHeader className="px-6 pt-6 pb-2">
              <div className="flex items-center gap-2 mb-1">
                <Plus className="w-5 h-5 text-primary" />
                <DialogTitle className="text-lg font-semibold text-foreground">Create New Tunnel</DialogTitle>
              </div>
              <DialogDescription className="text-sm text-muted-foreground">Fill in the details to create a new Cloudflare tunnel.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateTunnel} className="space-y-4 px-6 pb-6">
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">Cloudflare Account</label>
                {accountState.loading ? (
                  <div className="text-sm text-muted-foreground">Loading accounts...</div>
                ) : accountState.error ? (
                  <div className="text-destructive text-sm">{accountState.error}</div>
                ) : (
                  <select
                    className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    value={newTunnel.accountId}
                    onChange={handleAccountChange}
                    required
                  >
                    <option value="" disabled>Select an account</option>
                    {accountState.accounts.map(account => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">Name</label>
                <div className="relative">
                  <input
                    type="text"
                    className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Tunnel name"
                    value={newTunnel.name}
                    onChange={handleNameChange}
                    required
                  />
                  {nameCheck.checking && <div className="absolute right-2 top-2 h-5 w-5 border-t-2 border-b-2 border-primary rounded-full animate-spin"></div>}
                  {!nameCheck.checking && newTunnel.name.length > 2 && !nameCheck.available && <AlertTriangle className="absolute right-2 top-2.5 h-4 w-4 text-destructive" />}
                  {!nameCheck.checking && newTunnel.name.length > 2 && nameCheck.available && <Check className="absolute right-2 top-2.5 h-4 w-4 text-success" />}
                </div>
                {!nameCheck.checking && !nameCheck.available && <p className="text-xs text-destructive mt-1">{nameCheck.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">Full domain</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    className="flex-1 border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="subdomain"
                    value={domainState.subdomain}
                    onChange={e => setDomainState({ ...domainState, subdomain: e.target.value })}
                  />
                  <span className="text-lg text-muted-foreground">.</span>
                  <select
                    className="flex-1 border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    value={domainState.selected}
                    onChange={e => setDomainState({ ...domainState, selected: e.target.value })}
                    required
                  >
                    <option value="" disabled>Select main domain</option>
                    {domainState.domains.map((d: any) => (
                      <option key={d.id} value={d.domain}>{d.domain}</option>
                    ))}
                  </select>
                </div>
                <div className="text-xs text-muted-foreground mt-1">Example: <span className="font-mono">{domainState.subdomain ? `${domainState.subdomain}.` : ''}{domainState.selected || 'yourdomain.com'}</span></div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">Local Service</label>
                <div className="flex gap-2">
                  <select
                    className="border border-border bg-background rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    value={newTunnel.serviceProtocol}
                    onChange={e => setNewTunnel({ ...newTunnel, serviceProtocol: e.target.value, noTLSVerify: e.target.value === 'https' ? newTunnel.noTLSVerify : false })}
                    style={{ minWidth: 80 }}
                  >
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                  </select>
                  <input
                    type="text"
                    className="flex-1 border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="IP or hostname (e.g., 192.168.1.200)"
                    value={newTunnel.serviceHost}
                    onChange={e => setNewTunnel({ ...newTunnel, serviceHost: e.target.value })}
                    required
                  />
                  <span className="text-lg text-muted-foreground">:</span>
                  <input
                    type="number"
                    className="w-20 border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Port"
                    value={newTunnel.servicePort}
                    onChange={e => setNewTunnel({ ...newTunnel, servicePort: e.target.value })}
                    required
                    min={1}
                    max={65535}
                  />
                </div>
              </div>
              {newTunnel.serviceProtocol === 'https' && (
                <div className="flex items-center space-x-2 mt-2">
                  <Checkbox id="noTLSVerify" checked={newTunnel.noTLSVerify} onCheckedChange={checked => setNewTunnel(prev => ({ ...prev, noTLSVerify: !!checked }))} />
                  <label htmlFor="noTLSVerify" className="text-xs text-muted-foreground cursor-pointer select-none">Ignore local service TLS certificate validation (for self-signed HTTPS, e.g., Proxmox)</label>
                </div>
              )}
              {newTunnel.error && <div className="text-destructive text-sm">{newTunnel.error}</div>}
              <DialogFooter className="flex gap-2 pt-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => handleShowDialog(false)}>{newTunnel.creating ? "" : "Cancel"}</Button>
                <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90" disabled={newTunnel.creating}>{newTunnel.creating ? "Creating..." : "Create Tunnel"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      {/* Deletion confirmation modal */}
      <Dialog open={!!tunnelState.toDelete} onOpenChange={(open) => !open && setTunnelState((prev) => ({ ...prev, toDelete: null }))}>
        <DialogContent className="max-w-xs rounded-xl bg-card border border-border shadow-xl no-close">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-destructive">Delete Tunnel?</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">Are you sure you want to delete the tunnel <b>{tunnelState.toDelete?.name}</b> ({tunnelState.toDelete?.domain})? This action is irreversible.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setTunnelState(prev => ({ ...prev, toDelete: null }))} disabled={tunnelState.deleting}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" className="flex-1" onClick={() => handleDeleteTunnel(tunnelState.toDelete.id)} disabled={tunnelState.deleting}>
              {tunnelState.deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={dnsDialog.show} onOpenChange={() => {}}>
        <DialogContent className="max-w-xl rounded-xl bg-card border border-border shadow-xl no-close" onInteractOutside={e => e.preventDefault()}>
          <style>{`.no-close .DialogClose { display: none !important; }`}</style>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-destructive">DNS Record Exists</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">{dnsDialog.pendingMessage}</DialogDescription>
          </DialogHeader>

          <div className="text-sm space-y-2 py-2 text-muted-foreground">
            <p><strong className="font-semibold text-destructive">Cancel:</strong> Deletes the temporary tunnel created and closes this dialog.</p>
            <p><strong className="font-semibold text-blue-600">Proceed Anyway:</strong> Creates the tunnel without modifying the DNS record.</p>
            <p><strong className="font-semibold text-orange-500">Replace:</strong> Deletes the existing DNS record and creates a new one for this tunnel.</p>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button type="button" variant="secondary" className="flex-1 text-destructive hover:text-destructive" onClick={async () => {
              if (!dnsDialog.pendingTunnel || !dnsDialog.pendingTunnel.tunnelId) {
                setDnsDialog(prev => ({ ...prev, show: false }));
                return;
              }
              setDnsDialog(prev => ({ ...prev, cleanupLoading: true }));
              try {
                const res = await fetch(`${API_URL}/api/tunnels/cleanup-temp/${dnsDialog.pendingTunnel.tunnelId}`, { method: 'DELETE' });
                if (!res.ok) {
                  toast({ title: "Cleanup failed", description: "Could not remove temporary tunnel files.", variant: "destructive", duration: 2000 });
                }
              } catch {
                toast({ title: "Cleanup failed", description: "Could not remove temporary tunnel files.", variant: "destructive", duration: 2000 });
              } finally {
                setDnsDialog(prev => ({ ...prev, cleanupLoading: false }));
                setDnsDialog(prev => ({ ...prev, show: false }));
              }
            }} disabled={newTunnel.creating || dnsDialog.cleanupLoading}>
              {dnsDialog.cleanupLoading ? "Cancelling..." : "Cancel"}
            </Button>
            <Button type="button" variant="secondary" className="flex-1 text-blue-600 hover:text-blue-700" onClick={handleForceCreateTunnel(false)} disabled={newTunnel.creating}>
              {newTunnel.creating ? "Proceeding..." : "Proceed Anyway"}
            </Button>
            <Button type="button" variant="secondary" className="flex-1 text-orange-500 hover:text-orange-600" onClick={handleForceCreateTunnel(true)} disabled={newTunnel.creating}>
              {newTunnel.creating ? "Replacing..." : "Replace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Edit Tunnel Dialog */}
      <Dialog open={editDialog.show} onOpenChange={(open) => setEditDialog(prev => ({ ...prev, show: open }))}>
        <DialogContent className="max-w-xl rounded-xl bg-card border border-border shadow-xl p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <div className="flex items-center gap-2 mb-1">
              <Settings className="w-5 h-5 text-primary" />
              <DialogTitle className="text-lg font-semibold text-foreground">Edit Tunnel</DialogTitle>
            </div>
            <DialogDescription className="text-sm text-muted-foreground">Update the tunnel configuration.</DialogDescription>
          </DialogHeader>
          {editDialog.tunnel && (
            <form onSubmit={async (e) => {
              e.preventDefault();
              setEditDialog(prev => ({ ...prev, loading: true, error: null }));
              try {
                const fullDomain = editDialog.tunnel.subdomain 
                  ? `${editDialog.tunnel.subdomain}.${editDialog.tunnel.domain}`
                  : editDialog.tunnel.domain;
                const service = `${editDialog.tunnel.serviceProtocol}://${editDialog.tunnel.serviceHost}${editDialog.tunnel.servicePort ? `:${editDialog.tunnel.servicePort}` : ''}`;
                
                const response = await fetch(`${API_URL}/api/tunnels/${editDialog.tunnel.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    name: editDialog.tunnel.name,
                    domain: fullDomain,
                    service,
                    account_id: editDialog.tunnel.account_id,
                    noTLSVerify: editDialog.tunnel.no_tls_verify
                  })
                });

                if (!response.ok) {
                  const error = await response.json();
                  if (error.dnsRecordExists) {
                    setEditDnsDialog(prev => ({
                      ...prev,
                      pendingTunnel: {
                        ...editDialog.tunnel,
                        tunnelId: error.tunnelId,
                        name: editDialog.tunnel.name,
                        accountId: editDialog.tunnel.account_id,
                      },
                      pendingFullDomain: fullDomain,
                      pendingMessage: error.message || 'A DNS record with this name already exists. Do you want to proceed anyway?',
                      show: true
                    }));
                    setEditDialog(prev => ({ ...prev, loading: false }));
                    return;
                  }
                  if (error.oldDomainHasDns) {
                    setEditDnsDialog(prev => ({
                      ...prev,
                      pendingTunnel: {
                        ...editDialog.tunnel,
                        tunnelId: error.tunnelId,
                        name: editDialog.tunnel.name,
                        accountId: editDialog.tunnel.account_id,
                      },
                      pendingFullDomain: fullDomain,
                      pendingMessage: error.message || 'The old domain has a DNS record. Do you want to remove it and create a new one?',
                      show: true
                    }));
                    setEditDialog(prev => ({ ...prev, loading: false }));
                    return;
                  }
                  throw new Error(error.error || 'Error updating tunnel');
                }

                setEditDialog(prev => ({ ...prev, show: false }));
                afterCreateTunnel();
                toast({ title: 'Success', description: 'Tunnel updated successfully!', variant: 'default', duration: 2000 });
              } catch (err) {
                setEditDialog(prev => ({ ...prev, error: err.message }));
              } finally {
                setEditDialog(prev => ({ ...prev, loading: false }));
              }
            }} className="space-y-4 px-6 pb-6">
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">Name</label>
                <input
                  type="text"
                  className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  value={editDialog.tunnel.name}
                  onChange={(e) => setEditDialog(prev => ({
                    ...prev,
                    tunnel: { ...prev.tunnel, name: e.target.value }
                  }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">Full domain</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    className="flex-1 border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="subdomain"
                    value={editDialog.tunnel.subdomain}
                    onChange={(e) => setEditDialog(prev => ({
                      ...prev,
                      tunnel: { ...prev.tunnel, subdomain: e.target.value }
                    }))}
                  />
                  <span className="text-lg text-muted-foreground">.</span>
                  <select
                    className="flex-1 border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    value={editDialog.tunnel.domain}
                    onChange={(e) => setEditDialog(prev => ({
                      ...prev,
                      tunnel: { ...prev.tunnel, domain: e.target.value }
                    }))}
                    required
                  >
                    <option value="" disabled>Select main domain</option>
                    {domainState.domains.map((d: any) => (
                      <option key={d.id} value={d.domain}>{d.domain}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">Local Service</label>
                <div className="flex gap-2">
                  <select
                    className="border border-border bg-background rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    value={editDialog.tunnel.serviceProtocol}
                    onChange={(e) => setEditDialog(prev => ({
                      ...prev,
                      tunnel: { 
                        ...prev.tunnel, 
                        serviceProtocol: e.target.value,
                        no_tls_verify: e.target.value === 'https' ? prev.tunnel.no_tls_verify : false
                      }
                    }))}
                    style={{ minWidth: 80 }}
                  >
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                  </select>
                  <input
                    type="text"
                    className="flex-1 border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="IP or hostname (e.g., 192.168.1.200)"
                    value={editDialog.tunnel.serviceHost}
                    onChange={(e) => setEditDialog(prev => ({
                      ...prev,
                      tunnel: { ...prev.tunnel, serviceHost: e.target.value }
                    }))}
                    required
                  />
                  <span className="text-lg text-muted-foreground">:</span>
                  <input
                    type="number"
                    className="w-20 border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Port"
                    value={editDialog.tunnel.servicePort}
                    onChange={(e) => setEditDialog(prev => ({
                      ...prev,
                      tunnel: { ...prev.tunnel, servicePort: e.target.value }
                    }))}
                    required
                    min={1}
                    max={65535}
                  />
                </div>
              </div>
              {editDialog.tunnel.serviceProtocol === 'https' && (
                <div className="flex items-center space-x-2 mt-2">
                  <Checkbox 
                    id="editNoTLSVerify" 
                    checked={editDialog.tunnel.no_tls_verify} 
                    onCheckedChange={checked => setEditDialog(prev => ({
                      ...prev,
                      tunnel: { ...prev.tunnel, no_tls_verify: !!checked }
                    }))} 
                  />
                  <label htmlFor="editNoTLSVerify" className="text-xs text-muted-foreground cursor-pointer select-none">
                    Ignore local service TLS certificate validation (for self-signed HTTPS, e.g., Proxmox)
                  </label>
                </div>
              )}
              {editDialog.error && <div className="text-destructive text-sm">{editDialog.error}</div>}
              <DialogFooter className="flex gap-2 pt-2">
                <Button 
                  type="button" 
                  variant="secondary" 
                  className="flex-1" 
                  onClick={() => setEditDialog(prev => ({ ...prev, show: false }))}
                  disabled={editDialog.loading}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1 bg-primary hover:bg-primary/90" 
                  disabled={editDialog.loading}
                >
                  {editDialog.loading ? "Updating..." : "Update Tunnel"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      {/* Edit DNS Record Dialog */}
      <Dialog open={editDnsDialog.show} onOpenChange={() => {}}>
        <DialogContent className="max-w-xl rounded-xl bg-card border border-border shadow-xl no-close" onInteractOutside={e => e.preventDefault()}>
          <style>{`.no-close .DialogClose { display: none !important; }`}</style>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-destructive">DNS Record Management</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">{editDnsDialog.pendingMessage}</DialogDescription>
          </DialogHeader>

          <div className="text-sm space-y-2 py-2 text-muted-foreground">
            <p><strong className="font-semibold text-destructive">Cancel:</strong> Keeps the tunnel with the original domain.</p>
            <p><strong className="font-semibold text-blue-600">Proceed Anyway:</strong> Creates a new DNS record for the new domain without removing the old one (both domains will work).</p>
            <p><strong className="font-semibold text-orange-500">Replace:</strong> Removes old DNS record and creates a new one for the new domain.</p>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button type="button" variant="secondary" className="flex-1 text-destructive hover:text-destructive" onClick={() => {
              setEditDnsDialog(prev => ({ ...prev, show: false }));
            }} disabled={editDialog.loading || editDnsDialog.cleanupLoading || !!editDnsDialog.actionLoading}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" className="flex-1 text-blue-600 hover:text-blue-700" onClick={handleForceUpdateTunnel(false)} disabled={editDialog.loading || !!editDnsDialog.actionLoading}>
              {editDnsDialog.actionLoading === "proceed" ? "Proceeding..." : "Proceed Anyway"}
            </Button>
            <Button type="button" variant="secondary" className="flex-1 text-orange-500 hover:text-orange-600" onClick={handleForceUpdateTunnel(true)} disabled={editDialog.loading || !!editDnsDialog.actionLoading}>
              {editDnsDialog.actionLoading === "replace" ? "Replacing..." : "Replace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </Layout>
  );
};

export default Tunnels;
