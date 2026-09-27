import { Navigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

interface RoleRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
  module?: string;
  /** Módulos fusionados en una sola entrada: basta con tener uno de ellos. */
  anyModule?: string[];
}

export default function RoleRoute({ children, allowedRoles, module, anyModule }: RoleRouteProps) {
  const { user, isAuthenticated, permissions, hydrated } = useAuthStore();

  if (!hydrated) return null;
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!user || !allowedRoles.includes(user.role)) return <Navigate to="/panel" />;

  // ADMIN always has access to everything
  if (user.role === "ADMIN") return <>{children}</>;

  // Check module permission if specified
  const hasModule = module && (permissions.includes(module) || (module === "inventario" && permissions.includes("productos")));
  if (module && !hasModule && !anyModule?.some((m) => permissions.includes(m))) return <Navigate to="/panel" />;

  return <>{children}</>;
}
