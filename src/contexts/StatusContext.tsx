import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface StatusData {
  installed: boolean;
  version: string | null;
  latestVersion?: string | null;
  upToDate?: boolean;
  activeTunnels: number;
}

interface StatusContextType {
  status: StatusData | null;
  isLoading: boolean;
  lastChecked: Date | null;
  fetchStatus: (showLoading?: boolean) => Promise<void>;
}

const StatusContext = createContext<StatusContextType | undefined>(undefined);

export function StatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchStatus = async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }
    try {
      const response = await fetch("/api/status");
      const data = await response.json();
      setStatus(data);
      setLastChecked(new Date());
    } catch (error) {
      setStatus({ installed: false, version: null, latestVersion: null, upToDate: true, activeTunnels: 0 });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    
    fetchStatus();
    
    const id = setInterval(() => {
      if (mounted) {
        fetchStatus();
      }
    }, 15000); // 15 seconds
    
    return () => { 
      mounted = false; 
      clearInterval(id); 
    };
  }, []);

  return (
    <StatusContext.Provider value={{ status, isLoading, lastChecked, fetchStatus }}>
      {children}
    </StatusContext.Provider>
  );
}

export function useStatus() {
  const context = useContext(StatusContext);
  if (context === undefined) {
    throw new Error("useStatus must be used within a StatusProvider");
  }
  return context;
}
