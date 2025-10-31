import { useEffect, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Pencil, Trash } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
//MUDAR
const API_URL = "http://192.168.0.29:3001";

const Domains = () => {
  const [domains, setDomains] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filterAccount, setFilterAccount] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [newDomain, setNewDomain] = useState({ domain: "", zone_id: "", account_id: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [editDomain, setEditDomain] = useState<any | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [removeDomain, setRemoveDomain] = useState<any | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/domains`)
      .then(res => res.json())
      .then(setDomains);
    fetch(`${API_URL}/api/accounts`)
      .then(res => res.json())
      .then(setAccounts);
  }, []);

  useEffect(() => {
    if (showDialog) {
      setTimeout(() => {
        if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "SELECT")) {
          (document.activeElement as HTMLElement).blur();
        }
      }, 10);
    }
  }, [showDialog]);

  const filteredDomains = domains.filter((d) => {
    const matchesSearch = d.domain.toLowerCase().includes(search.toLowerCase());
    const matchesAccount = filterAccount === "all" || d.account_id === Number(filterAccount);
    return matchesSearch && matchesAccount;
  });

  const isDuplicate = (domain: string, id?: number) => {
    return domains.some(d => d.domain === domain && d.id !== id);
  };
  const isValidDomain = (domain: string) => /^(?!-)[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(domain);
  const isValidZoneId = (zone: string) => {
    if (!zone || zone.trim().length === 0) return true; // Allow empty zone ID
    if (zone.length !== 32) return false;
    return /^[A-Za-z0-9]+$/.test(zone);
  };

  const validateZoneIdWithAPI = async (zoneId: string): Promise<string | null> => {
    if (!zoneId || zoneId.trim().length === 0) return null; // Allow empty zone ID
    
    try {
      const response = await fetch(`${API_URL}/api/validate/zone-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zoneId })
      });
      
      const result = await response.json();
      if (!result.valid) {
        return result.error;
      }
      return null;
    } catch (error) {
      console.error('Zone ID validation error:', error);
      return 'Error validating Zone ID';
    }
  };

  const handleCreateDomain = async (e: any) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    
    if (newDomain.zone_id && newDomain.zone_id.trim()) {
      if (!isValidZoneId(newDomain.zone_id)) {
        setError("Invalid Zone ID format.");
        setCreating(false);
        return;
      }
      
      const zoneError = await validateZoneIdWithAPI(newDomain.zone_id);
      if (zoneError) {
        setError(zoneError);
        setCreating(false);
        return;
      }
    }
    
    try {
      const res = await fetch(`${API_URL}/api/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newDomain),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error adding domain.");
        setCreating(false);
        return;
      }
      setShowDialog(false);
      setNewDomain({ domain: "", zone_id: "", account_id: "" });
      const updated = await fetch(`${API_URL}/api/domains`).then(r => r.json());
      setDomains(updated);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleEditDomain = async (e: any) => {
    e.preventDefault();
    setEditLoading(true);
    setEditError(null);
    if (!editDomain.domain || !isValidDomain(editDomain.domain)) {
      setEditError("Invalid domain."); setEditLoading(false); return;
    }
    if (editDomain.zone_id && !isValidZoneId(editDomain.zone_id)) {
      setEditError("Invalid Zone ID."); setEditLoading(false); return;
    }
    if (isDuplicate(editDomain.domain, editDomain.id)) {
      setEditError("Domain already exists."); setEditLoading(false); return;
    }
    
    if (editDomain.zone_id && editDomain.zone_id.trim()) {
      const zoneError = await validateZoneIdWithAPI(editDomain.zone_id);
      if (zoneError) {
        setEditError(zoneError);
        setEditLoading(false);
        return;
      }
    }
    
    try {
      const res = await fetch(`${API_URL}/api/domains/${editDomain.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: editDomain.domain, zone_id: editDomain.zone_id, account_id: editDomain.account_id })
      });
      if (!res.ok) {
        const data = await res.json();
        setEditError(data.error || "Error editing domain.");
        setEditLoading(false);
        return;
      }
      setEditDomain(null);
      toast({ title: "Success", description: "Domain edited successfully!", variant: "default" });
      const updated = await fetch(`${API_URL}/api/domains`).then(r => r.json());
      setDomains(updated);
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  };
  const handleRemoveDomain = async () => {
    setRemoveLoading(true);
    setRemoveError(null);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const res = await fetch(`${API_URL}/api/domains/${removeDomain.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setRemoveError(data.error || "Error removing domain.");
        setRemoveLoading(false);
        return;
      }
      setRemoveDomain(null);
      toast({ title: "Success", description: "Domain removed successfully!", variant: "default" });
      const updated = await fetch(`${API_URL}/api/domains`).then(r => r.json());
      setDomains(updated);
    } catch (err: any) {
      setRemoveError(err.message);
    } finally {
      setRemoveLoading(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Domains</h1>
            <p className="text-muted-foreground">Manage all registered domains and their Zone IDs</p>
          </div>
            <Button className="bg-primary hover:bg-primary/90 shadow-primary" onClick={() => setShowDialog(true)}>
            + New domain
            </Button>
        </div>
        <div className="flex gap-4 items-center">
            <Input
            placeholder="Search domain..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <div className="min-w-[200px]">
            <Select value={filterAccount} onValueChange={setFilterAccount}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {accounts.map((a: any) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Domain</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Zone ID</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDomains.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.domain}</TableCell>
                <TableCell>{accounts.find((a: any) => a.id === d.account_id)?.name || "-"}</TableCell>
                <TableCell>{d.zone_id || <span className="text-muted-foreground">(not defined)</span>}</TableCell>
                <TableCell>
                  <div className="flex items-center space-x-1">
                    <Button size="sm" variant="outline" aria-label="Edit domain" onClick={() => setEditDomain(d)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="outline" aria-label="Remove domain" onClick={() => setRemoveDomain(d)}>
                      <Trash className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-md rounded-xl bg-card border border-border shadow-xl p-0">
            <DialogHeader className="px-6 pt-6 pb-2">
              <DialogTitle className="text-lg font-semibold text-foreground">Add domain</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Enter the domain, Zone ID and associated Cloudflare account.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateDomain} className="space-y-4 px-6 pb-6">
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">Cloudflare Account</label>
                <select
                  className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  value={newDomain.account_id}
                  onChange={e => setNewDomain({ ...newDomain, account_id: e.target.value })}
                  required
                >
                  <option value="" disabled>Select an account</option>
                  {accounts.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">Domain</label>
                <input
                  type="text"
                  className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ex: yourdomain.com"
                  value={newDomain.domain}
                  onChange={e => setNewDomain({ ...newDomain, domain: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">Zone ID</label>
                <input
                  type="text"
                  className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Cloudflare Zone ID (optional)"
                  value={newDomain.zone_id}
                  onChange={e => setNewDomain({ ...newDomain, zone_id: e.target.value })}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  Adding your Cloudflare Zone ID is recommended for easier and automatic DNS record management.
                </div>
              </div>
              {error && <div className="text-destructive text-sm">{error}</div>}
              <DialogFooter className="flex gap-2 pt-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90" disabled={creating}>
                  {creating ? "Adding..." : "Add"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        {/* Edit domain modal */}
        <Dialog open={!!editDomain} onOpenChange={open => !open && setEditDomain(null)}>
          <DialogContent className="max-w-md rounded-xl bg-card border border-border shadow-xl p-0">
            <DialogHeader className="px-6 pt-6 pb-2">
              <DialogTitle className="text-lg font-semibold text-foreground">Edit domain</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Change the domain, zone_id or associated account.
              </DialogDescription>
            </DialogHeader>
            {editDomain && (
              <form onSubmit={handleEditDomain} className="space-y-4 px-6 pb-6">
                <div>
                  <label className="block text-xs font-medium mb-1 text-muted-foreground">Cloudflare Account</label>
                  <select
                    className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    value={editDomain.account_id}
                    onChange={e => setEditDomain({ ...editDomain, account_id: e.target.value })}
                    required
                  >
                    <option value="" disabled>Select an account</option>
                    {accounts.map((a: any) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-muted-foreground">Domain</label>
                  <input
                    type="text"
                    className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    value={editDomain.domain}
                    onChange={e => setEditDomain({ ...editDomain, domain: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-muted-foreground">Zone ID</label>
                  <input
                    type="text"
                    className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Cloudflare Zone ID (optional)"
                    value={editDomain.zone_id}
                    onChange={e => setEditDomain({ ...editDomain, zone_id: e.target.value })}
                  />
                  <div className="text-xs text-muted-foreground mt-1">
                    Zone ID is good for automatic DNS record management and better Cloudflare integration. 
                    You can find it in your Cloudflare dashboard under the domain's overview page.
                  </div>
                </div>
                {editError && <div className="text-destructive text-sm">{editError}</div>}
                <DialogFooter className="flex gap-2 pt-2">
                  <Button type="button" variant="secondary" className="flex-1" onClick={() => setEditDomain(null)} disabled={editLoading}>Cancel</Button>
                  <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90" disabled={editLoading}>{editLoading ? "Saving..." : "Save"}</Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
        {/* Remove domain modal */}
        <Dialog open={!!removeDomain} onOpenChange={open => !open && setRemoveDomain(null)}>
          <DialogContent className="max-w-xs rounded-xl bg-card border border-border shadow-xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold text-destructive">Remove domain?</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Are you sure you want to remove the domain <span className="font-mono text-foreground">{removeDomain?.domain}</span>?
              </DialogDescription>
            </DialogHeader>
            {removeError && <div className="text-destructive text-sm">{removeError}</div>}
            <DialogFooter className="flex gap-2 pt-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setRemoveDomain(null)} disabled={removeLoading}>
                Cancel
              </Button>
              <Button type="button" className="flex-1 bg-destructive hover:bg-destructive/90 text-white" onClick={handleRemoveDomain} disabled={removeLoading}>
                {removeLoading ? "Removing..." : "Remove"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default Domains;
