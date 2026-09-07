import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { useAuthStore } from "./stores/authStore";
import MainLayout from "./components/layout/MainLayout";
import PublicLayout from "./components/public/PublicLayout";
import RoleRoute from "./components/RoleRoute";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import ContactPage from "./pages/ContactPage";
import PublicProductsPage from "./pages/PublicProductsPage";
import PublicProductDetailPage from "./pages/PublicProductDetailPage";
import DashboardPage from "./pages/DashboardPage";
import InventoryPage from "./pages/InventoryPage";
import ProductDetailPage from "./pages/ProductDetailPage";
import SalesPage from "./pages/SalesPage";
import WholesalePage from "./pages/WholesalePage";
import ReturnsPage from "./pages/ReturnsPage";
import RequestsPage from "./pages/RequestsPage";
import MovementsPage from "./pages/MovementsPage";
import CostsPage from "./pages/CostsPage";
import PricesPage from "./pages/PricesPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import DespatchListPage from "./pages/DespatchListPage";
import PurchaseNotesPage from "./pages/PurchaseNotesPage";
import ErrorBoundary from "./components/ErrorBoundary";

const ALL = ["ADMIN", "INVENTARIO", "TIENDA"];

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

export default function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "rgb(var(--dk-800))",
            color: "rgb(var(--gray-100))",
            border: "1px solid rgb(var(--dk-700))",
          },
        }}
      />
      <ErrorBoundary>
      <Routes>
        {/* Public routes */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/contacto" element={<ContactPage />} />
          <Route path="/productos" element={<PublicProductsPage />} />
          <Route path="/productos/:id" element={<PublicProductDetailPage />} />
        </Route>

        <Route path="/login" element={<LoginPage />} />

        {/* Protected admin panel */}
        <Route
          path="/panel"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          {/* Dashboard — todos los roles */}
          <Route index element={<DashboardPage />} />

          {/* Inventario — ADMIN + INVENTARIO + TIENDA (solo lectura) */}
          <Route path="inventario" element={
            <RoleRoute allowedRoles={["ADMIN", "INVENTARIO", "TIENDA"]} module="inventario">
              <InventoryPage />
            </RoleRoute>
          } />
          <Route path="inventario/:id" element={
            <RoleRoute allowedRoles={["ADMIN", "INVENTARIO", "TIENDA"]} module="inventario">
              <ProductDetailPage />
            </RoleRoute>
          } />

          {/* Ventas — ADMIN + TIENDA */}
          <Route path="ventas" element={
            <RoleRoute allowedRoles={["ADMIN", "TIENDA"]} module="ventas">
              <SalesPage />
            </RoleRoute>
          } />

          {/* Ventas por Mayor — ADMIN + TIENDA */}
          <Route path="ventas-mayor" element={
            <RoleRoute allowedRoles={["ADMIN", "TIENDA"]} module="ventas-mayor">
              <WholesalePage />
            </RoleRoute>
          } />

          {/* Devoluciones — ADMIN + TIENDA */}
          <Route path="devoluciones" element={
            <RoleRoute allowedRoles={["ADMIN", "TIENDA"]} module="devoluciones">
              <ReturnsPage />
            </RoleRoute>
          } />

          {/* Solicitudes — todos */}
          <Route path="solicitudes" element={
            <RoleRoute allowedRoles={ALL} module="solicitudes">
              <RequestsPage />
            </RoleRoute>
          } />

          {/* Movimientos — ADMIN + INVENTARIO */}
          <Route path="movimientos" element={
            <RoleRoute allowedRoles={["ADMIN", "INVENTARIO"]} module="movimientos">
              <MovementsPage />
            </RoleRoute>
          } />

          {/* Lista de Despacho — todos los roles */}
          <Route path="despachos" element={
            <RoleRoute allowedRoles={ALL} module="despachos">
              <DespatchListPage />
            </RoleRoute>
          } />

          {/* Costos — solo ADMIN */}
          <Route path="costos" element={
            <RoleRoute allowedRoles={["ADMIN"]} module="costos">
              <CostsPage />
            </RoleRoute>
          } />

          {/* Precios — solo ADMIN */}
          <Route path="precios" element={
            <RoleRoute allowedRoles={["ADMIN"]} module="precios">
              <PricesPage />
            </RoleRoute>
          } />

          {/* Notas de Compra — solo ADMIN */}
          <Route path="notas-compra" element={
            <RoleRoute allowedRoles={["ADMIN"]} module="notas-compra">
              <PurchaseNotesPage />
            </RoleRoute>
          } />

          {/* Reportes — ADMIN + TIENDA */}
          <Route path="reportes" element={
            <RoleRoute allowedRoles={["ADMIN", "TIENDA"]} module="reportes">
              <ReportsPage />
            </RoleRoute>
          } />

          {/* Configuración — solo ADMIN */}
          <Route path="configuracion" element={
            <RoleRoute allowedRoles={["ADMIN"]} module="configuracion">
              <SettingsPage />
            </RoleRoute>
          } />
        </Route>
      </Routes>
      </ErrorBoundary>
    </>
  );
}
