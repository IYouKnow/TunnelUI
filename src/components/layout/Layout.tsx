import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const hasVisited = localStorage.getItem("cf-gui-welcome-shown");
    if (!hasVisited) {
      setShowWelcome(true);
    }
  }, []);

  const handleCloseWelcome = () => {
    localStorage.setItem("cf-gui-welcome-shown", "true");
    setShowWelcome(false);
  };

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar 
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
          isCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />
        
        <main className="flex-1 overflow-auto bg-background p-6">
          {children}
        </main>
      </div>
      
      
      {/* Welcome popup */}
      <Dialog open={showWelcome} onOpenChange={setShowWelcome}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="w-5 h-5 text-primary" />
              Welcome to Cloudflare Tunnel GUI
            </DialogTitle>
            <DialogDescription>
              Follow these steps to get started with the application:
            </DialogDescription>
          </DialogHeader>
          <ol className="list-decimal pl-5 space-y-2 text-sm">
            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-success" /> Install Cloudflared on your machine</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-success" /> Configure your Cloudflare account</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-success" /> Create your first tunnel</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-success" /> Add domains and services</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-success" /> Monitor tunnel status</li>
          </ol>
          <DialogFooter>
            <Button onClick={handleCloseWelcome} className="w-full">Get Started</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}