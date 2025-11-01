import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TunnelModalProvider } from "@/contexts/TunnelModalContext";
import { StatusProvider } from "@/contexts/StatusContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Tunnels from "./pages/Tunnels";
import NotFound from "./pages/NotFound";
import Accounts from "./pages/Accounts";
import Domains from "./pages/Domains";
import Auth from "./pages/Auth";

const queryClient = new QueryClient();

const App = () => (
	<QueryClientProvider client={queryClient}>
		<NotificationsProvider>
			<StatusProvider>
				<TunnelModalProvider>
					<TooltipProvider>
						<Toaster />
						<Sonner />
                    <BrowserRouter>
                        <AuthProvider>
                            <Routes>
                                <Route path="/auth" element={<Auth />} />
                                <Route path="/login" element={<Navigate to="/auth" replace />} />
                                <Route path="/register" element={<Navigate to="/auth" replace />} />
                                <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                                <Route path="/tunnels" element={<ProtectedRoute><Tunnels /></ProtectedRoute>} />
                                <Route path="/accounts" element={<ProtectedRoute><Accounts /></ProtectedRoute>} />
                                <Route path="/domains" element={<ProtectedRoute><Domains /></ProtectedRoute>} />
                                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                                <Route path="*" element={<NotFound />} />
                            </Routes>
                        </AuthProvider>
                    </BrowserRouter>
					</TooltipProvider>
				</TunnelModalProvider>
			</StatusProvider>
		</NotificationsProvider>
	</QueryClientProvider>
);

export default App;
