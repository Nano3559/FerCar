import { useState, useEffect, useCallback } from "react";
import {
  Users, Shield, Plus, Pencil, Trash2, X, User, RefreshCw, Check, History, Store, Home,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "../services/api";
import { useDialogBehavior } from "../components/ui/useDialog";

interface UserRecord {
  id: number; name: string; email: string; role: string; roleId: number;
  locationId: number | null; locationName: string;
}

interface Role {
  id: number; name: string; permissions: string[]; columnConfig: Record<string, string[]>; userCount: number;
}

interface Location {
  id: number; name: string; type: string; address: string | null;
}

interface AuditLogEntry {
  id: number; userId: number; action: string; targetType: string; targetId: number | null;
  oldValue: any; newValue: any; createdAt: string;
  user?: { id: number; name: string; email: string };
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-red-500/10 text-red-400 border-red-500/20",
  INVENTARIO: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  TIENDA: "bg-green-500/10 text-green-400 border-green-500/20",
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  INVENTARIO: "Inventario",
  TIENDA: "Tienda",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN: "Acceso total al sistema",
  INVENTARIO: "Gestión de productos, stock, movimientos, costos, precios",
  TIENDA: "Ventas, devoluciones, solicitudes, reportes (con categorías asignadas)",
};

const MODULE_LABELS: Record<string, string> = {
  inventario: "Inventario", ventas: "Ventas", "ventas-mayor": "Ventas por Mayor",
  devoluciones: "Devoluciones", solicitudes: "Solicitudes", movimientos: "Movimientos",
  costos: "Costos", precios: "Precios", reportes: "Reportes", configuracion: "Configuración",
  despachos: "Lista de Despacho", "notas-compra": "Notas de Compra",
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"users" | "roles" | "audit" | "locations">("users");
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<number | null>(null);
  const [userForm, setUserForm] = useState({ name: "", email: "", role: "", password: "", locationId: "" });
  const [saving, setSaving] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);

  const deleteConfirmPanelRef = useDialogBehavior(showDeleteConfirm !== null, () => setShowDeleteConfirm(null));
  const userPanelRef = useDialogBehavior(showUserModal, () => setShowUserModal(false));

  const [showRoleModal, setShowRoleModal] = useState(false);
  const [roleForm, setRoleForm] = useState({ name: "", permissions: [] as string[], categories: [] as string[] });
  const [roleSaving, setRoleSaving] = useState(false);
  const [showDeleteRoleConfirm, setShowDeleteRoleConfirm] = useState<Role | null>(null);
  const rolePanelRef = useDialogBehavior(showRoleModal, () => setShowRoleModal(false));
  const deleteRoleConfirmPanelRef = useDialogBehavior(showDeleteRoleConfirm !== null, () => setShowDeleteRoleConfirm(null));

  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<number | null>(null);
  const [locationForm, setLocationForm] = useState({ name: "", type: "TIENDA", address: "" });
  const [locationSaving, setLocationSaving] = useState(false);
  const [showDeleteLocationConfirm, setShowDeleteLocationConfirm] = useState<number | null>(null);
  const locationPanelRef = useDialogBehavior(showLocationModal, () => setShowLocationModal(false));
  const deleteLocationConfirmPanelRef = useDialogBehavior(showDeleteLocationConfirm !== null, () => setShowDeleteLocationConfirm(null));

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [usersRes, rolesRes, locsRes] = await Promise.all([
        api.get("/users"),
        api.get("/permissions/roles"),
        api.get("/locations"),
      ]);
      setUsers(usersRes.data.users);
      setRoles(rolesRes.data.roles);
      setLocations(locsRes.data.locations || locsRes.data);
      try {
        const catRes = await api.get("/products/filters");
        setCategories(catRes.data.categories || []);
      } catch { /* categorías opcionales */ }
    } catch {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchAuditLogs = useCallback(async (page = 1) => {
    try {
      const res = await api.get("/permissions/audit", { params: { page, limit: 20 } });
      setAuditLogs(res.data.logs);
      setAuditTotal(res.data.pagination.total);
      setAuditPage(page);
    } catch {
      toast.error("Error al cargar auditoría");
    }
  }, []);

  const openCreate = () => {
    setEditingUser(null);
    setUserForm({ name: "", email: "", role: "", password: "", locationId: "" });
    setShowUserModal(true);
  };

  const openEdit = (u: UserRecord) => {
    setEditingUser(u.id);
    setUserForm({ name: u.name, email: u.email, role: u.role, password: "", locationId: u.locationId ? String(u.locationId) : "" });
    setShowUserModal(true);
  };

  const saveUser = async () => {
    if (!userForm.name || !userForm.email || !userForm.role) {
      toast.error("Completa todos los campos obligatorios"); return;
    }
    if (!editingUser && !userForm.password) {
      toast.error("La contraseña es obligatoria"); return;
    }
    try {
      setSaving(true);
      const payload: any = {
        name: userForm.name,
        email: userForm.email,
        role: userForm.role,
        locationId: userForm.locationId ? Number(userForm.locationId) : null,
      };
      if (userForm.password) payload.password = userForm.password;

      if (editingUser) {
        await api.put(`/users/${editingUser}`, payload);
        toast.success("Usuario actualizado");
      } else {
        await api.post("/users", payload);
        toast.success("Usuario creado");
      }
      setShowUserModal(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (id: number) => {
    try {
      await api.delete(`/users/${id}`);
      toast.success("Usuario eliminado");
      setShowDeleteConfirm(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al eliminar");
    }
  };

  const togglePermission = async (roleId: number, module: string) => {
    const role = roles.find((r) => r.id === roleId);
    if (!role || role.name === "ADMIN") return;

    const newPerms = role.permissions.includes(module)
      ? role.permissions.filter((p) => p !== module)
      : [...role.permissions, module];

    try {
      await api.put(`/permissions/roles/${roleId}/permissions`, { permissions: newPerms });
      setRoles((prev) => prev.map((r) => r.id === roleId ? { ...r, permissions: newPerms } : r));
      toast.success("Permisos actualizados");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al actualizar permisos");
    }
  };

  const allModules = Object.keys(MODULE_LABELS);

  const openCreateRole = () => {
    setRoleForm({ name: "", permissions: [], categories: [] });
    setShowRoleModal(true);
  };

  const toggleRoleModule = (mod: string) => {
    setRoleForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(mod) ? prev.permissions.filter((m) => m !== mod) : [...prev.permissions, mod],
    }));
  };

  const toggleRoleCategory = (cat: string) => {
    setRoleForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(cat) ? prev.categories.filter((c) => c !== cat) : [...prev.categories, cat],
    }));
  };

  const createRole = async () => {
    const name = roleForm.name.trim();
    if (!name) {
      toast.error("Ingresa un nombre para el rol"); return;
    }
    setRoleSaving(true);
    try {
      await api.post("/permissions/roles", {
        name,
        permissions: roleForm.permissions,
        columnConfig: roleForm.categories.length > 0 ? { __categorias: roleForm.categories } : {},
      });
      toast.success("Rol creado");
      setShowRoleModal(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al crear el rol");
    } finally {
      setRoleSaving(false);
    }
  };

  const deleteRole = async (role: Role) => {
    try {
      await api.delete(`/permissions/roles/${role.id}`);
      toast.success("Rol eliminado");
      setShowDeleteRoleConfirm(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al eliminar el rol");
    }
  };

  const openCreateLocation = () => {
    setEditingLocation(null);
    setLocationForm({ name: "", type: "TIENDA", address: "" });
    setShowLocationModal(true);
  };

  const openEditLocation = (loc: Location) => {
    setEditingLocation(loc.id);
    setLocationForm({ name: loc.name, type: loc.type, address: loc.address || "" });
    setShowLocationModal(true);
  };

  const saveLocation = async () => {
    if (!locationForm.name.trim()) {
      toast.error("El nombre de la ubicación es obligatorio"); return;
    }
    setLocationSaving(true);
    try {
      if (editingLocation) {
        await api.put(`/locations/${editingLocation}`, locationForm);
        toast.success("Ubicación actualizada");
      } else {
        await api.post("/locations", locationForm);
        toast.success("Ubicación creada");
      }
      setShowLocationModal(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al guardar");
    } finally {
      setLocationSaving(false);
    }
  };

  const deleteLocation = async () => {
    if (showDeleteLocationConfirm == null) return;
    try {
      await api.delete(`/locations/${showDeleteLocationConfirm}`);
      toast.success("Ubicación eliminada");
      setShowDeleteLocationConfirm(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al eliminar");
    }
  };

  const getRoleCategories = (role: Role): string[] => {
    const raw = role.columnConfig?.__categorias;
    return Array.isArray(raw) ? (raw as string[]) : [];
  };

  const toggleCategory = async (role: Role, catName: string) => {
    const current = getRoleCategories(role);
    const next = current.includes(catName)
      ? current.filter((c) => c !== catName)
      : [...current, catName];
    const columnConfig = { ...(role.columnConfig || {}), __categorias: next };
    try {
      await api.put(`/permissions/roles/${role.id}/columns`, { columnConfig });
      setRoles((prev) => prev.map((r) => r.id === role.id ? { ...r, columnConfig } : r));
      toast.success("Categorías actualizadas");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al actualizar categorías");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configuración</h1>
        <p className="text-gray-400 text-sm mt-1">Gestión de usuarios, roles y permisos</p>
      </div>

      <div className="flex gap-2 bg-dark-800/50 border border-dark-700/50 rounded-xl p-1">
        <button onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "users" ? "bg-primary-600/20 text-primary-400 border border-primary-600/30" : "text-gray-400 hover:text-gray-200 border border-transparent"
          }`}>
          <Users size={16} /> Usuarios
        </button>
        <button onClick={() => setActiveTab("roles")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "roles" ? "bg-primary-600/20 text-primary-400 border border-primary-600/30" : "text-gray-400 hover:text-gray-200 border border-transparent"
          }`}>
          <Shield size={16} /> Roles y Permisos
        </button>
        <button onClick={() => { setActiveTab("audit"); fetchAuditLogs(); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "audit" ? "bg-primary-600/20 text-primary-400 border border-primary-600/30" : "text-gray-400 hover:text-gray-200 border border-transparent"
          }`}>
          <History size={16} /> Auditoría
        </button>
        <button onClick={() => setActiveTab("locations")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "locations" ? "bg-primary-600/20 text-primary-400 border border-primary-600/30" : "text-gray-400 hover:text-gray-200 border border-transparent"
          }`}>
          <Store size={16} /> Ubicaciones
        </button>
      </div>

      {activeTab === "users" && (
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-700/50 flex items-center justify-between">
            <h3 className="text-foreground font-medium">Usuarios del Sistema ({users.length})</h3>
            <div className="flex items-center gap-2">
              <button onClick={fetchData} className="p-1.5 text-gray-400 hover:text-foreground rounded-lg transition-all"><RefreshCw size={14} /></button>
              <button onClick={openCreate}
                className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-medium transition-all">
                <Plus size={14} /> Nuevo Usuario
              </button>
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center h-32"><RefreshCw size={24} className="text-primary-400 animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700/50">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Nombre</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Email</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Rol</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Ubicación</th>
                    <th className="text-center px-4 py-3 text-gray-400 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-dark-700/30 hover:bg-dark-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-dark-700 rounded-full flex items-center justify-center">
                            <User size={14} className="text-gray-400" />
                          </div>
                          <span className="text-foreground font-medium">{u.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-300">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${ROLE_COLORS[u.role] || "bg-gray-500/10 text-gray-400 border-gray-500/20"}`}>
                          {ROLE_LABELS[u.role] || u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{u.locationName}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(u)} className="p-1.5 text-gray-400 hover:text-primary-400 hover:bg-primary-500/10 rounded-lg transition-all" title="Editar">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => setShowDeleteConfirm(u.id)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title="Eliminar">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "roles" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-foreground font-medium">Roles del Sistema ({roles.length})</h3>
            <button onClick={openCreateRole}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-medium transition-all">
              <Plus size={14} /> Nuevo Rol
            </button>
          </div>
          {roles.map((role) => (
            <div key={role.id} className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${ROLE_COLORS[role.name] || ""}`}>
                    <Shield size={18} />
                  </div>
                  <div>
                    <h4 className="text-foreground font-medium">{ROLE_LABELS[role.name] || role.name}</h4>
                    <p className="text-gray-400 text-xs mt-0.5">{ROLE_DESCRIPTIONS[role.name] || role.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{role.userCount} usuarios</span>
                  {role.name !== "ADMIN" && (
                    <button onClick={() => setShowDeleteRoleConfirm(role)} title="Eliminar rol"
                      className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Módulos visibles</p>
                <div className="flex flex-wrap gap-2">
                  {allModules.map((mod) => {
                    const hasPerm = role.name === "ADMIN" || role.permissions.includes(mod);
                    const isAdmin = role.name === "ADMIN";
                    return (
                      <button
                        key={mod}
                        onClick={() => !isAdmin && togglePermission(role.id, mod)}
                        disabled={isAdmin}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
                          hasPerm
                            ? "bg-primary-600/10 border-primary-600/30 text-primary-400"
                            : "bg-dark-900/50 border-dark-700/50 text-gray-500 hover:text-gray-400"
                        } ${isAdmin ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:border-primary-500/40"}`}
                      >
                        {hasPerm && <Check size={12} />}
                        {MODULE_LABELS[mod] || mod}
                      </button>
                    );
                  })}
                </div>
              </div>

              {role.columnConfig && typeof role.columnConfig === "object" && (
                (() => {
                  const colEntries = Object.entries(role.columnConfig).filter(([k]) => k !== "__categorias");
                  return colEntries.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Columnas configuradas</p>
                      <div className="flex flex-wrap gap-1">
                        {colEntries.map(([module, cols]) => (
                          <span key={module} className="px-2 py-0.5 bg-dark-700 text-gray-400 rounded text-xs">
                            {MODULE_LABELS[module] || module}: {(cols as string[]).length} cols
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()
              )}

              <div className="mt-4 pt-4 border-t border-dark-700/50">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Categorías visibles</p>
                {categories.length === 0 ? (
                  <p className="text-xs text-gray-600">No hay categorías registradas</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => {
                      const hasCat = getRoleCategories(role).includes(cat.name);
                      const isAdmin = role.name === "ADMIN";
                      return (
                        <button
                          key={cat.id}
                          onClick={() => !isAdmin && toggleCategory(role, cat.name)}
                          disabled={isAdmin}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
                            hasCat || isAdmin
                              ? "bg-amber-600/10 border-amber-600/30 text-amber-400"
                              : "bg-dark-900/50 border-dark-700/50 text-gray-500 hover:text-gray-400"
                          } ${isAdmin ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:border-amber-500/40"}`}
                        >
                          {(hasCat || isAdmin) && <Check size={12} />}
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                {role.name === "ADMIN" && (
                  <p className="text-xs text-gray-600 mt-2">El administrador ve todas las categorías.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "audit" && (
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-700/50 flex items-center justify-between">
            <h3 className="text-foreground font-medium">Registro de Auditoría ({auditTotal} cambios)</h3>
            <button onClick={() => fetchAuditLogs(auditPage)} className="p-1.5 text-gray-400 hover:text-foreground rounded-lg transition-all"><RefreshCw size={14} /></button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700/50">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Fecha/Hora</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Usuario</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Acción</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Tipo</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Sin registros de auditoría</td></tr>
                ) : auditLogs.map((log) => (
                  <tr key={log.id} className="border-b border-dark-700/30 hover:bg-dark-700/30 transition-colors">
                    <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("es-BO")}
                    </td>
                    <td className="px-4 py-3 text-foreground text-xs">{log.user?.name || `User #${log.userId}`}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-primary-600/10 text-primary-400 rounded text-xs border border-primary-600/20">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{log.targetType} #{log.targetId}</td>
                    <td className="px-4 py-3 text-xs max-w-xs truncate">
                      {log.oldValue != null && (
                        <span className="text-red-400 line-through mr-2">
                          {typeof log.oldValue === "object" ? JSON.stringify(log.oldValue) : String(log.oldValue)}
                        </span>
                      )}
                      {log.newValue != null && (
                        <span className="text-green-400">
                          {typeof log.newValue === "object" ? JSON.stringify(log.newValue) : String(log.newValue)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {auditTotal > 20 && (
            <div className="px-4 py-3 border-t border-dark-700/50 flex items-center justify-center gap-2">
              <button onClick={() => fetchAuditLogs(auditPage - 1)} disabled={auditPage <= 1}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                Anterior
              </button>
              <span className="text-xs text-gray-500">Página {auditPage} / {Math.ceil(auditTotal / 20)}</span>
              <button onClick={() => fetchAuditLogs(auditPage + 1)} disabled={auditPage * 20 >= auditTotal}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === "locations" && (
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-700/50 flex items-center justify-between">
            <h3 className="text-foreground font-medium">Ubicaciones ({locations.length})</h3>
            <div className="flex items-center gap-2">
              <button onClick={fetchData} className="p-1.5 text-gray-400 hover:text-foreground rounded-lg transition-all"><RefreshCw size={14} /></button>
              <button onClick={openCreateLocation}
                className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-medium transition-all">
                <Plus size={14} /> Nueva Ubicación
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700/50">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Nombre</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Tipo</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Dirección</th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {locations.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">Sin ubicaciones registradas</td></tr>
                ) : locations.map((loc) => (
                  <tr key={loc.id} className="border-b border-dark-700/30 hover:bg-dark-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-dark-700 rounded-full flex items-center justify-center">
                          {loc.type === "ALMACEN" ? <Home size={14} className="text-gray-400" /> : <Store size={14} className="text-gray-400" />}
                        </div>
                        <span className="text-foreground font-medium">{loc.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${loc.type === "ALMACEN"
                        ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                        : "bg-green-500/10 text-green-400 border-green-500/20"}`}>
                        {loc.type === "ALMACEN" ? "Almacén" : "Tienda"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{loc.address || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEditLocation(loc)} className="p-1.5 text-gray-400 hover:text-primary-400 hover:bg-primary-500/10 rounded-lg transition-all" title="Editar">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setShowDeleteLocationConfirm(loc.id)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div ref={deleteConfirmPanelRef} role="dialog" aria-modal="true" aria-label="Eliminar usuario" className="bg-dark-800 border border-dark-700/50 rounded-2xl p-6 w-full max-w-sm text-center">
            <Trash2 size={40} className="text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground mb-2">¿Eliminar usuario?</h3>
            <p className="text-gray-400 text-sm mb-6">{users.find((u) => u.id === showDeleteConfirm)?.name || "Este usuario"} será eliminado. Esta acción no se puede deshacer.</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setShowDeleteConfirm(null)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-foreground transition-colors">Cancelar</button>
              <button onClick={() => deleteUser(showDeleteConfirm)} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {showUserModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div ref={userPanelRef} role="dialog" aria-modal="true" aria-label={editingUser ? "Editar usuario" : "Nuevo usuario"} className="bg-dark-900 border border-dark-700/50 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/50">
              <h3 className="text-lg font-bold text-foreground">{editingUser ? "Editar Usuario" : "Nuevo Usuario"}</h3>
              <button onClick={() => setShowUserModal(false)} aria-label="Cerrar" className="p-1.5 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-lg transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nombre *</label>
                <input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Email *</label>
                <input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Rol *</label>
                <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500">
                  <option value="">Seleccionar rol...</option>
                  {roles.map((r) => <option key={r.id} value={r.name}>{ROLE_LABELS[r.name] || r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Ubicación</label>
                <select value={userForm.locationId} onChange={(e) => setUserForm({ ...userForm, locationId: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500">
                  <option value="">Sin ubicación</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Contraseña {editingUser ? "(dejar vacío para no cambiar)" : "*"}</label>
                <input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-700/50">
              <button onClick={() => setShowUserModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl text-sm transition-all">
                Cancelar
              </button>
              <button onClick={saveUser} disabled={saving}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary-600/20 disabled:opacity-50">
                {saving ? "Guardando..." : editingUser ? "Guardar Cambios" : "Crear Usuario"}
              </button>
            </div>
          </div>
        </div>
      )}
    {showDeleteRoleConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div ref={deleteRoleConfirmPanelRef} role="dialog" aria-modal="true" aria-label="Eliminar rol" className="bg-dark-800 border border-dark-700/50 rounded-2xl p-6 w-full max-w-sm text-center">
            <Trash2 size={40} className="text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground mb-2">¿Eliminar rol?</h3>
            <p className="text-gray-400 text-sm mb-6">El rol "<span className="text-foreground font-medium">{showDeleteRoleConfirm.name}</span>" será eliminado. Esta acción no se puede deshacer.</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setShowDeleteRoleConfirm(null)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-foreground transition-colors">Cancelar</button>
              <button onClick={() => deleteRole(showDeleteRoleConfirm)} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteLocationConfirm != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div ref={deleteLocationConfirmPanelRef} role="dialog" aria-modal="true" aria-label="Eliminar ubicación" className="bg-dark-800 border border-dark-700/50 rounded-2xl p-6 w-full max-w-sm text-center">
            <Trash2 size={40} className="text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground mb-2">¿Eliminar ubicación?</h3>
            <p className="text-gray-400 text-sm mb-6">{locations.find((l) => l.id === showDeleteLocationConfirm)?.name || "Esta ubicación"} será eliminada.</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setShowDeleteLocationConfirm(null)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-foreground transition-colors">Cancelar</button>
              <button onClick={deleteLocation} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {showRoleModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div ref={rolePanelRef} role="dialog" aria-modal="true" aria-label="Nuevo rol" className="bg-dark-900 border border-dark-700/50 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/50">
              <h3 className="text-lg font-bold text-foreground">Nuevo Rol</h3>
              <button onClick={() => setShowRoleModal(false)} aria-label="Cerrar" className="p-1.5 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-lg transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nombre del rol *</label>
                <input value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} placeholder="Ej: ALMACEN"
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
                <p className="text-[11px] text-gray-600 mt-1">Se guardará en mayúsculas.</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Módulos visibles</p>
                <div className="flex flex-wrap gap-2">
                  {allModules.map((mod) => {
                    const on = roleForm.permissions.includes(mod);
                    return (
                      <button key={mod} type="button" onClick={() => toggleRoleModule(mod)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
                          on ? "bg-primary-600/10 border-primary-600/30 text-primary-400" : "bg-dark-900/50 border-dark-700/50 text-gray-500 hover:text-gray-400 hover:border-primary-500/40"
                        }`}>
                        {on && <Check size={12} />}
                        {MODULE_LABELS[mod] || mod}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Categorías visibles</p>
                {categories.length === 0 ? (
                  <p className="text-xs text-gray-600">No hay categorías registradas</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => {
                      const on = roleForm.categories.includes(cat.name);
                      return (
                        <button key={cat.id} type="button" onClick={() => toggleRoleCategory(cat.name)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
                            on ? "bg-amber-600/10 border-amber-600/30 text-amber-400" : "bg-dark-900/50 border-dark-700/50 text-gray-500 hover:text-gray-400 hover:border-amber-500/40"
                          }`}>
                          {on && <Check size={12} />}
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-700/50">
              <button onClick={() => setShowRoleModal(false)} className="px-4 py-2 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl text-sm transition-all">Cancelar</button>
              <button onClick={createRole} disabled={roleSaving}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary-600/20 disabled:opacity-50">
                {roleSaving ? "Creando..." : "Crear Rol"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLocationModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div ref={locationPanelRef} role="dialog" aria-modal="true" aria-label={editingLocation ? "Editar ubicación" : "Nueva ubicación"} className="bg-dark-900 border border-dark-700/50 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/50">
              <h3 className="text-lg font-bold text-foreground">{editingLocation ? "Editar Ubicación" : "Nueva Ubicación"}</h3>
              <button onClick={() => setShowLocationModal(false)} aria-label="Cerrar" className="p-1.5 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-lg transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nombre *</label>
                <input value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} placeholder="Ej: Tienda 4"
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setLocationForm({ ...locationForm, type: "TIENDA" })}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      locationForm.type === "TIENDA"
                        ? "bg-green-600/10 border-green-600/30 text-green-400"
                        : "bg-dark-800 border-dark-700 text-gray-500 hover:text-gray-300"
                    }`}>
                    <Store size={15} /> Tienda
                  </button>
                  <button type="button" onClick={() => setLocationForm({ ...locationForm, type: "ALMACEN" })}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      locationForm.type === "ALMACEN"
                        ? "bg-blue-600/10 border-blue-600/30 text-blue-400"
                        : "bg-dark-800 border-dark-700 text-gray-500 hover:text-gray-300"
                    }`}>
                    <Home size={15} /> Almacén
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Dirección</label>
                <input value={locationForm.address} onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })} placeholder="Opcional"
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl text-foreground text-sm focus:outline-none focus:border-primary-500" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-700/50">
              <button onClick={() => setShowLocationModal(false)} className="px-4 py-2 text-gray-400 hover:text-foreground hover:bg-dark-700 rounded-xl text-sm transition-all">Cancelar</button>
              <button onClick={saveLocation} disabled={locationSaving}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary-600/20 disabled:opacity-50">
                {locationSaving ? "Guardando..." : editingLocation ? "Guardar Cambios" : "Crear Ubicación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
