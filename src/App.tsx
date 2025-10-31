import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TunnelModalProvider } from "@/contexts/TunnelModalContext";
import { StatusProvider } from "@/contexts/StatusContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import Index from "./pages/Index";
import Tunnels from "./pages/Tunnels";
import NotFound from "./pages/NotFound";
import Accounts from "./pages/Accounts";
import Domains from "./pages/Domains";

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
							<Routes>
								<Route path="/" element={<Index />} />
								<Route path="/tunnels" element={<Tunnels />} />
								<Route path="/accounts" element={<Accounts />} />
								<Route path="/domains" element={<Domains />} />
								{/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
								<Route path="*" element={<NotFound />} />
							</Routes>
						</BrowserRouter>
					</TooltipProvider>
				</TunnelModalProvider>
			</StatusProvider>
		</NotificationsProvider>
	</QueryClientProvider>
);

export default App;
