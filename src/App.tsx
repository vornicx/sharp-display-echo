import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { I18nProvider } from "@/lib/i18n";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import PartesList from "./pages/PartesList";
import PartDetail from "./pages/PartDetail";
import ConsumoCostes from "./pages/ConsumoCostes";
import Asistencia from "./pages/Asistencia";
import DSJCalculator from "./pages/DSJCalculator";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const Protected = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <AppLayout>{children}</AppLayout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <I18nProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={<Protected><Index /></Protected>} />
              <Route path="/partes" element={<Protected><PartesList /></Protected>} />
              <Route path="/partes/:id" element={<Protected><PartDetail /></Protected>} />
              <Route path="/costes/consumos" element={<Protected><ConsumoCostes /></Protected>} />
              <Route path="/costes/asistencia" element={<Protected><Asistencia /></Protected>} />
              <Route path="/dsj" element={<Protected><DSJCalculator /></Protected>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </I18nProvider>
  </QueryClientProvider>
);

export default App;
