import React, { useState, useEffect, useRef } from "react";
import { Menu, Bell, User, Search, Wifi, WifiOff, Package2, Terminal, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/contexts/NotificationsContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";

interface HeaderProps {
  isCollapsed: boolean;
  onToggleSidebar: () => void;
}

export function Header({ isCollapsed, onToggleSidebar }: HeaderProps) {
  const [isPackageInstalled, setIsPackageInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [copiedStates, setCopiedStates] = useState<{ [key: number]: boolean }>({});
  const [showCopyAllFallback, setShowCopyAllFallback] = useState(false);
  const [copyAll, setCopyAll] = useState(false);
  const copyAllTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<{ success: boolean; message: string } | null>(null);
  const [installOutput, setInstallOutput] = useState<string>('');
  const [installStep, setInstallStep] = useState<string>('');
  const [installProgress, setInstallProgress] = useState<number>(0);

  const { notifications, unreadCount, markAllRead, markRead, remove, clearAll } = useNotifications();
  const { user, logout } = useAuth();

  const commands = [
    'sudo apt update && sudo apt upgrade -y',
    'sudo apt install -y wget curl gnupg lsb-release',
    'wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb',
    'sudo dpkg -i cloudflared-linux-amd64.deb',
    'sudo apt --fix-broken install -y'
  ];

  function fallbackCopyTextToClipboard(text: string) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    // Force reflow
    window.getSelection()?.removeAllRanges();
    textarea.setSelectionRange(0, textarea.value.length);
    let success = false;
    try {
      success = document.execCommand('copy');
      console.log('Fallback copy success:', success);
    } catch (e) {
      console.error('Fallback copy failed', e);
    }
    document.body.removeChild(textarea);
    return success;
  }

  useEffect(() => {
    fetch('/api/cloudflared/package-status')
      .then(res => res.json())
      .then(data => {
        setIsPackageInstalled(data.installed);
        setError(null);
      })
      .catch(err => {
        console.error('Error checking cloudflared package:', err);
        setIsPackageInstalled(false);
        setError('Could not connect to backend server');
      });
  }, []);

  return (
    <header className="flex items-center justify-between h-16 px-6 border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="flex items-center space-x-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleSidebar}
          className="text-muted-foreground hover:text-foreground"
        >
          <Menu className="w-5 h-5" />
        </Button>

        <div className="hidden md:flex items-center space-x-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search tunnels, settings..."
              className="pl-10 w-64 bg-background/50"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger>
              <div className={cn(
                "flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-medium",
                isPackageInstalled 
                  ? "bg-success/10 text-success border border-success/20" 
                  : "bg-destructive/10 text-destructive border border-destructive/20"
              )}>
                {isPackageInstalled ? (
                  <Wifi className="w-3 h-3" />
                ) : (
                  <WifiOff className="w-3 h-3" />
                )}
                <span>
                  {isPackageInstalled ? "Connected to Cloudflare" : "Disconnected"}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col space-y-2 p-2">
                <div className="flex items-center space-x-2">
                  <Package2 className="w-4 h-4" />
                  <span>
                    cloudflared: {error ? (
                      <span className="text-destructive">Error checking status</span>
                    ) : isPackageInstalled ? (
                      <span className="text-success">Installed</span>
                    ) : (
                      <span className="text-destructive">Not installed</span>
                    )}
                  </span>
                </div>
                {!isPackageInstalled && !error && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full text-xs"
                    onClick={() => setShowInstallModal(true)}
                  >
                    <Terminal className="w-3 h-3 mr-1" />
                    Instruções de Instalação
                  </Button>
                )}
                {error && (
                  <div className="text-xs text-destructive mt-1">
                    {error}
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Right section */}
      <div className="flex items-center space-x-3">
        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-1 -right-1 h-5 min-w-[1.25rem] rounded-full p-0 flex items-center justify-center text-[10px]"
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0">
            <div className="px-3 py-2 flex items-center justify-between">
              <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={markAllRead} disabled={unreadCount === 0}>Mark all read</Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={clearAll}>Clear</Button>
              </div>
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-80">
              <ScrollArea className="h-80">
                <div className="py-1">
                  {notifications.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-muted-foreground">No notifications</div>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className={cn("px-3 py-2 text-sm cursor-default select-none outline-none", !n.read && "bg-primary/5")}
                        onMouseEnter={() => { if (!n.read) markRead(n.id); }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="font-medium leading-none mb-1">{n.title}</div>
                            {n.description && <div className="text-muted-foreground text-xs leading-snug">{n.description}</div>}
                            <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.timestamp).toLocaleString()}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            {!n.read && <span className="inline-block h-2 w-2 rounded-full bg-primary" />}
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove(n.id)} aria-label="Dismiss">
                              ×
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center">
                  <User className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-sm font-medium">{user.name || user.email}</div>
                  <div className="text-xs text-muted-foreground">{user.email}</div>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => {}}>
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {}}>
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {}}>
                System Logs
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={logout}>
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button asChild variant="default" size="sm">
            <a href="/login">Sign in</a>
          </Button>
        )}
      </div>

      <Dialog open={showInstallModal} onOpenChange={setShowInstallModal}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Install Cloudflared</DialogTitle>
            <DialogDescription>
              To use this application, you need to install the Cloudflare Tunnel daemon (cloudflared) on your system.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Official Installation Method (Debian/Ubuntu):</h4>
              <div className="bg-muted rounded-md p-3 font-mono text-xs space-y-4 relative">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm font-medium">Terminal Commands</span>
                  </div>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="text-xs px-3 py-1"
                    disabled={installing || isPackageInstalled}
                    onClick={async () => {
                      setInstalling(true);
                      setInstallResult(null);
                      setInstallOutput('');
                      setInstallProgress(0);
                      setInstallStep('Starting installation...');
                      
                      const progressSteps = [
                        'Updating system packages...',
                        'Installing prerequisites...',
                        'Downloading cloudflared package...',
                        'Installing cloudflared...',
                        'Fixing dependencies...',
                        'Installation completed!'
                      ];
                      
                      let currentStep = 0;
                      const progressInterval = setInterval(() => {
                        if (currentStep < progressSteps.length - 1) {
                          currentStep++;
                          setInstallStep(progressSteps[currentStep]);
                          setInstallProgress((currentStep / (progressSteps.length - 1)) * 100);
                        }
                      }, 2000); // Update every 2 seconds
                      
                      try {
                        const res = await fetch('/api/cloudflared/install', { method: 'POST' });
                        const data = await res.json();
                        clearInterval(progressInterval);
                        
                        if (res.ok) {
                          setInstallStep('Installation completed successfully!');
                          setInstallProgress(100);
                          setInstallOutput(data.stdout || 'Installation completed successfully.');
                          setInstallResult({ success: true, message: 'Installation completed!' });
                          fetch('/api/cloudflared/package-status')
                            .then(res => res.json())
                            .then(data => setIsPackageInstalled(data.installed));
                        } else {
                          setInstallStep('Installation failed');
                          setInstallOutput(data.stderr || data.error || 'Installation failed.');
                          setInstallResult({ success: false, message: data.error || 'Install failed.' });
                        }
                      } catch (err) {
                        clearInterval(progressInterval);
                        setInstallStep('Installation failed');
                        setInstallResult({ success: false, message: (err as Error).message });
                      } finally {
                        setInstalling(false);
                      }
                    }}
                  >
                    {installing ? (
                      <span className="flex items-center"><span className="animate-spin mr-2">⏳</span>Instalando...</span>
                    ) : isPackageInstalled ? (
                      <span>Instalado</span>
                    ) : (
                      <span>Instalar</span>
                    )}
                  </Button>
                </div>
                <div className="space-y-2">
                  {commands.map((command, index) => (
                    <div key={index} className="group relative">
                      <p className="text-xs text-muted-foreground mb-1">
                        {index === 0 && "1. Update system:"}
                        {index === 1 && "2. Install prerequisites:"}
                        {index === 2 && "3. Download the latest .deb package for cloudflared:"}
                        {index === 3 && "4. Install the package:"}
                        {index === 4 && "5. Fix missing dependencies (if necessary):"}
                      </p>
                      <div className="relative bg-background/50 rounded border border-border p-1 group-hover:border-primary/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <textarea
                            readOnly
                            value={command}
                            className="flex-1 bg-transparent border-none resize-none text-xs font-mono p-1 focus:outline-none focus:ring-0 h-6 min-h-[24px] max-h-[40px] leading-tight"
                            onClick={(e) => e.currentTarget.select()}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 shrink-0"
                            onClick={(e) => {
                              const textArea = e.currentTarget.parentElement?.querySelector('textarea');
                              if (textArea) {
                                textArea.select();
                                const success = document.execCommand('copy');
                                if (success) {
                                  setCopiedStates(prev => ({ ...prev, [index]: true }));
                                  setTimeout(() => {
                                    setCopiedStates(prev => ({ ...prev, [index]: false }));
                                  }, 2000);
                                }
                              }
                            }}
                          >
                            {copiedStates[index] ? (
                              <>
                                <Check size={14} className="text-green-500" />
                                <span className="text-green-500">Copiado!</span>
                              </>
                            ) : (
                              <>
                                <Copy size={14} />
                                <span>Copiar</span>
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Installation Progress - Show immediately when installing starts */}
                {(installing || installOutput) && (
                  <div className="bg-muted rounded-md p-3 mt-2">
                    <div className="text-xs font-medium mb-2 flex items-center justify-between">
                      <span>{installStep}</span>
                      {installing && <span className="text-muted-foreground">{Math.round(installProgress)}%</span>}
                    </div>
                    {installing && (
                      <div className="w-full bg-background rounded-full h-2 mb-2">
                        <div 
                          className="bg-primary h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${installProgress}%` }}
                        />
                      </div>
                    )}
                    {installOutput && (
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-32 overflow-auto">{installOutput}</pre>
                    )}
                  </div>
                )}

                {installResult && (
                  <div className={`text-xs mb-2 ${installResult.success ? 'text-green-600' : 'text-red-600'}`}>{installResult.message}</div>
                )}
              </div>
            </div>
            <div>
                <h4 className="text-sm font-medium mb-2">Other Installation Methods:</h4>
                <p className="text-sm text-muted-foreground">
                  For other installation methods, visit the{" "}
                <a 
                  href="https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  documentação do Cloudflare
                </a>
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showCopyAllFallback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded shadow-lg p-6 max-w-lg w-full flex flex-col items-center">
            <div className="mb-2 font-semibold">Manual Copy Required</div>
            <div className="mb-2 text-sm text-muted-foreground">Press Ctrl+C (Cmd+C on Mac) to copy all commands</div>
            <textarea
              ref={copyAllTextareaRef}
              value={commands.join('\n')}
              readOnly
              className="w-full h-32 p-2 border rounded font-mono text-xs mb-4"
              onFocus={e => e.currentTarget.select()}
            />
            <Button onClick={() => setShowCopyAllFallback(false)} size="sm">Fechar</Button>
          </div>
        </div>
      )}
    </header>
  );
}
