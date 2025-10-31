import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useNotifications } from "@/contexts/NotificationsContext";

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
  const prevRef = useRef<StatusData | null>(null);
  const didAnnounceVersionOutdatedRef = useRef(false);
  const { addNotification } = useNotifications();

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
    }, 15000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!status) return;
    const prev = prevRef.current;

    if (prev) {
      if (prev.installed !== status.installed) {
        addNotification({
          title: status.installed ? "Cloudflared connected" : "Cloudflared disconnected",
          description: status.installed ? "Backend connection restored" : "Cannot reach cloudflared backend",
          type: status.installed ? "success" : "error",
        });
      }

      if (typeof status.upToDate === "boolean" && status.upToDate === false && !didAnnounceVersionOutdatedRef.current) {
        didAnnounceVersionOutdatedRef.current = true;
        const ver = status.version ?? "unknown";
        const latest = status.latestVersion ?? "unknown";
        addNotification({
          title: "Update available",
          description: `cloudflared ${ver} → ${latest}`,
          type: "warning",
        });
      }

      if (prev.activeTunnels !== status.activeTunnels) {
        addNotification({
          title: "Active tunnels changed",
          description: `${prev.activeTunnels} → ${status.activeTunnels}`,
          type: "info",
        });
      }
    } else {
      // First load messages
      if (status.installed) {
        addNotification({ title: "Cloudflared connected", type: "success" });
      }
      if (typeof status.upToDate === "boolean" && status.upToDate === false && !didAnnounceVersionOutdatedRef.current) {
        didAnnounceVersionOutdatedRef.current = true;
        const ver = status.version ?? "unknown";
        const latest = status.latestVersion ?? "unknown";
        addNotification({ title: "Update available", description: `cloudflared ${ver} → ${latest}`, type: "warning" });
      }
    }

    prevRef.current = status;
  }, [status, addNotification]);

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
