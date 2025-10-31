import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, Plus, Pencil, UserCog, Trash, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout/Layout";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Link } from "react-router-dom";

interface Account {
  id: number;
  name: string;
  description?: string;
  domains?: string[];
  api_token?: string; // Added for the new API Token field
}

interface Domain { id: number; domain: string; }
//MUDAR
const API_URL = "http://192.168.0.29:3001";

const Accounts = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [cmdOutput, setCmdOutput] = useState<string | null>(null);
  const [cmdError, setCmdError] = useState<string | null>(null);
  const [cmdLoading, setCmdLoading] = useState(false);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [certStatus, setCertStatus] = useState<'idle' | 'checking' | 'created' | 'not_created'>('idle');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDomains, setEditDomains] = useState<Domain[]>([]);
  const [editingDomainIndex, setEditingDomainIndex] = useState<number | null>(null);
  const [editingDomainValue, setEditingDomainValue] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [domainToRemove, setDomainToRemove] = useState<{ idx: number, value: string, id: number } | null>(null);
  const [newDomains, setNewDomains] = useState<string[]>([]);
  const [newDomainInput, setNewDomainInput] = useState("");
  const [newEditingDomainIndex, setNewEditingDomainIndex] = useState<number | null>(null);
  const [newEditingDomainValue, setNewEditingDomainValue] = useState("");
  const [newApiToken, setNewApiToken] = useState<string | null>(null);
  const [editApiToken, setEditApiToken] = useState<string>("");
  const [accountDomains, setAccountDomains] = useState<{ [accountId: number]: Domain[] }>({});
  const { toast } = useToast();

  useEffect(() => {
    if (showDialog) {
      setTimeout(() => {
        if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "SELECT")) {
          (document.activeElement as HTMLElement).blur();
        }
      }, 10);
    }
  }, [showDialog]);

  useEffect(() => {
    const fetchAccountsAndDomains = async () => {
      try {
        const accountsRes = await fetch(`${API_URL}/api/accounts`);
        if (!accountsRes.ok) throw new Error("Error fetching accounts");
        const accountsData = await accountsRes.json();
        setAccounts(accountsData);

        const domainsMap: { [accountId: number]: Domain[] } = {};
        for (const account of accountsData) {
          try {
            const domainsRes = await fetch(`${API_URL}/api/domains?account_id=${account.id}`);
            if (domainsRes.ok) {
              const domainsData = await domainsRes.json();
              domainsMap[account.id] = domainsData;
            } else {
              domainsMap[account.id] = [];
            }
          } catch (err) {
            domainsMap[account.id] = [];
          }
        }
        setAccountDomains(domainsMap);
        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    };

    fetchAccountsAndDomains();
  }, []);

  const openEditDialog = async (account: Account) => {
    setEditingAccount(account);
    setEditName(account.name);
    setEditDescription(account.description || "");
    setEditApiToken(account.api_token || "");
    setEditingDomainIndex(null);
    setEditingDomainValue("");
    setNewDomain("");
    setEditDialogOpen(true);
    setEditDomains([]); // Don't load domains for editing
  };

  const handleStartEditDomain = (idx: number) => {
    setEditingDomainIndex(idx);
    setEditingDomainValue(editDomains[idx].domain);
  };

  const handleCancelEditDomain = () => {
    setEditingDomainIndex(null);
    setEditingDomainValue("");
  };

  const handleSaveEditDomain = async (idx: number) => {
    if (editingDomainValue.trim() && !editDomains.some(d => d.domain === editingDomainValue.trim()) && editingAccount) {
      const domainId = editDomains[idx].id;
      await fetch(`${API_URL}/api/domains/${domainId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: editingDomainValue.trim() })
      });
      const res = await fetch(`${API_URL}/api/domains?account_id=${editingAccount.id}`);
      setEditDomains(await res.json());
      setEditingDomainIndex(null);
      setEditingDomainValue("");
    }
  };

  const handleRemoveDomain = (idx: number) => {
    setDomainToRemove(editDomains[idx] ? { idx, value: editDomains[idx].domain, id: editDomains[idx].id } : null);
  };
  const confirmRemoveDomain = async () => {
    if (domainToRemove && editingAccount) {
      await fetch(`${API_URL}/api/domains/${domainToRemove.id}`, { method: 'DELETE' });
      const res = await fetch(`${API_URL}/api/domains?account_id=${editingAccount.id}`);
      setEditDomains(await res.json());
      if (editingDomainIndex === domainToRemove.idx) {
        setEditingDomainIndex(null);
        setEditingDomainValue("");
      }
      setDomainToRemove(null);
    }
  };

  const handleAddDomain = async () => {
    if (newDomain.trim() && !editDomains.some(d => d.domain === newDomain.trim()) && editingAccount) {
      await fetch(`${API_URL}/api/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: editingAccount.id, domain: newDomain.trim() })
      });
      const res = await fetch(`${API_URL}/api/domains?account_id=${editingAccount.id}`);
      setEditDomains(await res.json());
      setNewDomain("");
    }
  };

  const handleEditSave = async () => {
    if (!editingAccount) return;
    
    if (editApiToken && editApiToken.trim()) {
      const tokenError = await validateApiToken(editApiToken);
      if (tokenError) {
        toast({ title: 'Error', description: tokenError, variant: 'destructive' });
        return;
      }
    }
    
    try {
      const res = await fetch(`${API_URL}/api/accounts/${editingAccount.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, description: editDescription, api_token: editApiToken })
      });
      if (!res.ok) {
        toast({ title: 'Error', description: 'Error editing account.', variant: 'destructive' });
        return;
      }
      const updated = await fetch(`${API_URL}/api/accounts`).then(r => r.json());
      setAccounts(updated);
      
      // Refresh domains data
      const domainsMap: { [accountId: number]: Domain[] } = {};
      for (const account of updated) {
        try {
          const domainsRes = await fetch(`${API_URL}/api/domains?account_id=${account.id}`);
          if (domainsRes.ok) {
            const domainsData = await domainsRes.json();
            domainsMap[account.id] = domainsData;
          } else {
            domainsMap[account.id] = [];
          }
        } catch (err) {
          domainsMap[account.id] = [];
        }
      }
      setAccountDomains(domainsMap);
      
      toast({ title: 'Success', description: 'Account edited successfully!', variant: 'default' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Error editing account.', variant: 'destructive' });
    }
    setEditDialogOpen(false);
  };

  useEffect(() => {
    fetch(`${API_URL}/api/accounts`)
      .then((res) => {
        if (!res.ok) throw new Error("Error fetching accounts");
        return res.json();
      })
      .then((data) => {
        setAccounts(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Polling to check if cert.pem was created
  useEffect(() => {
    if (!loginUrl) {
      setCertStatus('idle');
      setStep(1);
      return;
    }
    setCertStatus('checking');
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/cloudflared/cert-status?name=${encodeURIComponent(newName)}`);
        const data = await res.json();
        if (data.exists) {
          setCertStatus('created');
          clearInterval(interval);
          setStep(3);
        } else {
          setCertStatus('not_created');
        }
      } catch {
        setCertStatus('not_created');
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [loginUrl, newName]);

  const validateName = (name: string) => {
    if (!name) return 'Name is required.';
    if (/\s/.test(name)) return 'Name cannot contain spaces.';
    return null;
  };

  const validateApiToken = async (token: string): Promise<string | null> => {
    if (!token || token.trim().length === 0) return null; // Allow empty token
    
    try {
      const response = await fetch(`${API_URL}/api/validate/api-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      
      const result = await response.json();
      if (!result.valid) {
        return result.error;
      }
      return null;
    } catch (error) {
      console.error('API token validation error:', error);
      return 'Error validating API token';
    }
  };

  const handleNextStep = async () => {
    const err = validateName(newName);
    setNameError(err);
    if (!err) {
      setStep(2);
      handleLogin();
    }
  };

  const handleLogin = async () => {
    setCmdOutput(null);
    setCmdError(null);
    setCmdLoading(true);
    setLoginUrl(null);
    setSubmitError(null);
    try {
      const res = await fetch(`${API_URL}/api/cloudflared/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
      });
      const data = await res.json();
      if (!res.ok) {
        setCmdError(data.error || 'Unknown error');
        setCmdOutput(data.output || '');
      } else if (data.url) {
        setLoginUrl(data.url);
        setCmdOutput(data.output || 'Login URL captured.');
      } else {
        setCmdOutput(data.output || 'Command executed with no output.');
      }
    } catch (err: any) {
      setCmdError(err.message);
    } finally {
      setCmdLoading(false);
    }
  };

  // Add domain in new account modal
  const handleAddNewDomain = () => {
    if (newDomainInput.trim() && !newDomains.includes(newDomainInput.trim())) {
      setNewDomains(prev => [...prev, newDomainInput.trim()]);
      setNewDomainInput("");
    }
  };
  const handleRemoveNewDomain = (idx: number) => {
    setNewDomains(prev => prev.filter((_, i) => i !== idx));
  };

  const handleStartEditNewDomain = (idx: number) => {
    setNewEditingDomainIndex(idx);
    setNewEditingDomainValue(newDomains[idx]);
  };
  const handleCancelEditNewDomain = () => {
    setNewEditingDomainIndex(null);
    setNewEditingDomainValue("");
  };
  const handleSaveEditNewDomain = (idx: number) => {
    if (newEditingDomainValue.trim() && !newDomains.includes(newEditingDomainValue.trim())) {
      setNewDomains(prev => prev.map((d, i) => i === idx ? newEditingDomainValue.trim() : d));
      setNewEditingDomainIndex(null);
      setNewEditingDomainValue("");
    }
  };

  const handleSubmitAccount = async () => {
    setSubmitLoading(true);
    setSubmitError(null);
    
    if (newApiToken && newApiToken.trim()) {
      const tokenError = await validateApiToken(newApiToken);
      if (tokenError) {
        setSubmitError(tokenError);
        toast({ title: 'Error', description: tokenError, variant: 'destructive' });
        setSubmitLoading(false);
        return;
      }
    }
    
    try {
      const res = await fetch(`${API_URL}/api/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, description: newDescription, api_token: newApiToken })
      });
      if (!res.ok) {
        const data = await res.json();
        setSubmitError(data.error || 'Error adding account.');
        toast({ title: 'Error', description: data.error || 'Error adding account.', variant: 'destructive' });
        setSubmitLoading(false);
        return;
      }
      const updated = await fetch(`${API_URL}/api/accounts`).then(r => r.json());
      setAccounts(updated);
      
      // Refresh domains data
      const domainsMap: { [accountId: number]: Domain[] } = {};
      for (const account of updated) {
        try {
          const domainsRes = await fetch(`${API_URL}/api/domains?account_id=${account.id}`);
          if (domainsRes.ok) {
            const domainsData = await domainsRes.json();
            domainsMap[account.id] = domainsData;
          } else {
            domainsMap[account.id] = [];
          }
        } catch (err) {
          domainsMap[account.id] = [];
        }
      }
      setAccountDomains(domainsMap);
      
      toast({ title: 'Success', description: 'Account added successfully!', variant: 'default' });
      // Get the new account id
      const created = await res.json();
      const createdAccount = Array.isArray(updated) ? updated.find(acc => acc.name === newName) : null;
      if (createdAccount && newDomains.length > 0) {
        for (const domain of newDomains) {
          await fetch(`${API_URL}/api/domains`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_id: createdAccount.id, domain })
          });
        }
        // Refresh domains again after adding domains
        const finalDomainsMap: { [accountId: number]: Domain[] } = {};
        for (const account of updated) {
          try {
            const domainsRes = await fetch(`${API_URL}/api/domains?account_id=${account.id}`);
            if (domainsRes.ok) {
              const domainsData = await domainsRes.json();
              finalDomainsMap[account.id] = domainsData;
            } else {
              finalDomainsMap[account.id] = [];
            }
          } catch (err) {
            finalDomainsMap[account.id] = [];
          }
        }
        setAccountDomains(finalDomainsMap);
      }
      setShowDialog(false);
      setNewDomains([]);
      setNewDomainInput("");
    } catch (err: any) {
      setSubmitError(err.message);
      toast({ title: 'Error', description: err.message || 'Error adding account.', variant: 'destructive' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleCloseNewAccountModal = () => {
    setShowDialog(false);
    setNewName("");
    setNewDescription("");
    setNewDomains([]);
    setNewDomainInput("");
    setNewEditingDomainIndex(null);
    setNewEditingDomainValue("");
    setNameError(null);
    setSubmitError(null);
    setStep(1);
    setCmdOutput(null);
    setCmdError(null);
    setCmdLoading(false);
    setLoginUrl(null);
    setCertStatus('idle');
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Accounts</h1>
            <p className="text-muted-foreground">Manage your authenticated Cloudflare accounts</p>
          </div>
            <Button className="bg-primary hover:bg-primary/90 shadow-primary" onClick={() => setShowDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Account
          </Button>
        </div>
        {loading ? (
          <div>Loading...</div>
        ) : error ? (
          <div className="text-destructive">{error}</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => (
              <Card key={account.id} className="bg-gradient-card border border-border/50 relative">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Globe className="w-5 h-5" />
                    <span>{account.name}</span>
                  </CardTitle>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute top-3 right-3 text-primary hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
                        onClick={() => openEditDialog(account)}
                        aria-label="Edit account"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">Edit account</TooltipContent>
                  </Tooltip>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground whitespace-pre-line">{account.description}</div>
                  <div className="mt-3">
                    {accountDomains[account.id] && accountDomains[account.id].length > 0 ? (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">Domains:</div>
                        <div className="flex flex-wrap gap-1">
                          {accountDomains[account.id].map((domain, index) => (
                            <span
                              key={domain.id}
                              className="inline-block px-2 py-1 text-xs bg-primary/10 text-primary rounded-md border border-primary/20"
                            >
                              {domain.domain}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground italic">
                        No domains set for this account.{" "}
                        <Link to="/domains" className="flex items-center text-primary hover:underline">
                          <ExternalLink className="w-4 h-4 mr-1" />
                          Add domains
                        </Link>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      {/* Dialog to show command output */}
      <Dialog open={showDialog} onOpenChange={open => { if (!open) handleCloseNewAccountModal(); }}>
        <DialogContent className="max-w-md rounded-xl bg-card border border-border shadow-xl p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <div className="flex items-center gap-2 mb-1">
              <UserCog className="w-5 h-5 text-primary" />
              <DialogTitle className="text-lg font-semibold text-foreground">Add new Cloudflare account</DialogTitle>
            </div>
            <DialogDescription className="text-sm text-muted-foreground">
              {step === 1
                ? 'Enter the name (no spaces) and description for the account.'
                : 'Login to your Cloudflare account to generate the certificate.'}
            </DialogDescription>
          </DialogHeader>
          {step === 1 ? (
            <form onSubmit={e => { e.preventDefault(); handleNextStep(); }} className="space-y-4 px-6 pb-6">
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">Account name</label>
                <input
                  type="text"
                  className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Identifier name (no spaces)"
                  value={newName}
                  onChange={e => { setNewName(e.target.value); setNameError(null); }}
                  required
                  autoFocus
                />
                {nameError && <div className="text-destructive text-xs mt-1">{nameError}</div>}
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">Description</label>
                <textarea
                  className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  placeholder="Domains, notes, etc."
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">API Token (Cloudflare)</label>
                <input
                  type="password"
                  className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Optional, can be added later"
                  value={newApiToken || ''}
                  onChange={e => setNewApiToken(e.target.value)}
                />
              </div>
              {submitError && <div className="text-destructive text-xs mb-2">{submitError}</div>}
              <DialogFooter className="flex gap-2 pt-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90" disabled={submitLoading}>
                  {submitLoading ? 'Saving...' : 'Next'}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            // Passo 2: login e polling cert.pem
            <div className="px-6 pb-6">
              {cmdLoading ? (
                <div className="text-sm text-muted-foreground">Running command...</div>
              ) : (
                <>
                  {cmdError && <div className="text-destructive whitespace-pre-wrap text-xs mb-2">{cmdError}</div>}
                  {step === 2 && (
                    loginUrl ? (
                      <div className="my-2">
                        <div className="mb-2 text-success font-semibold">Login URL captured:</div>
                        <a href={loginUrl} target="_blank" rel="noopener noreferrer" className="underline text-primary break-all">{loginUrl}</a>
                        <div className="mt-2 text-xs text-muted-foreground">Open this link in your browser to authenticate your Cloudflare account.</div>
                        {certStatus === 'created' && (
                          <div className="mt-4 text-xs text-muted-foreground">Certificate created! Finalizing registration...</div>
                        )}
                        {certStatus === 'checking' && (
                          <div className="mt-4 text-xs text-muted-foreground">Waiting for certificate creation...</div>
                        )}
                      </div>
                    ) : (
                      <pre className="bg-muted p-2 rounded text-xs whitespace-pre-wrap max-h-64 overflow-auto">{cmdOutput}</pre>
                    )
                  )}
                  {step === 3 && (
                    <Step3Success onFinish={async () => {
                      await handleSubmitAccount();
                      setShowDialog(false);
                      setStep(1);
                      setNewName("");
                      setNewDescription("");
                      setNewDomains([]);
                      setNewDomainInput("");
                      setNewEditingDomainIndex(null);
                      setNewEditingDomainValue("");
                      setNameError(null);
                      setSubmitError(null);
                      setCmdOutput(null);
                      setCmdError(null);
                      setCmdLoading(false);
                      setLoginUrl(null);
                      setCertStatus('idle');
                    }} />
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Dialog to edit account */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md rounded-xl bg-card border border-border shadow-xl p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
              <div className="flex items-center gap-2 mb-1">
              <UserCog className="w-5 h-5 text-primary" />
              <DialogTitle className="text-lg font-semibold text-foreground">Add new Cloudflare account</DialogTitle>
            </div>
            <DialogDescription className="text-sm text-muted-foreground">
              Change the name, description and API Token for the Cloudflare account.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); handleEditSave(); }} className="space-y-4 px-6 pb-6">
            <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">Account name</label>
                <input
                  type="text"
                  className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">Description</label>
                <textarea
                  className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground">API Token (Cloudflare)</label>
              <input
                type="password"
                className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Optional, can be added later"
                value={editApiToken}
                onChange={e => setEditApiToken(e.target.value)}
              />
            </div>
            <DialogFooter className="flex gap-2 pt-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90">
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Domain removal confirmation modal */}
      <Dialog open={!!domainToRemove} onOpenChange={open => !open && setDomainToRemove(null)}>
        <DialogContent className="max-w-xs rounded-xl bg-card border border-border shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-destructive">Remove domain?</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Are you sure you want to remove the domain <span className="font-mono text-foreground">{domainToRemove?.value}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 pt-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setDomainToRemove(null)}>
                Cancel
              </Button>
              <Button type="button" className="flex-1 bg-destructive hover:bg-destructive/90 text-white" onClick={confirmRemoveDomain}>
                Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Accounts;

interface Step3SuccessProps {
  onFinish: () => void;
}
function Step3Success({ onFinish }: Step3SuccessProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="text-green-600 text-2xl mb-2">✅ Account added successfully!</div>
      <Button onClick={onFinish}>Finish</Button>
    </div>
  );
}
