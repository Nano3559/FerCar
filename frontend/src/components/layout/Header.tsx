import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { User, Bell, Menu, CheckCheck, X, Sun, Moon, Monitor } from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { useThemeStore } from "../../stores/themeStore";
import { useDialogBehavior } from "../ui/useDialog";
import api from "../../services/api";

interface Notification {
  id: number; title: string; message: string; type: string; read: boolean;
  linkUrl?: string; createdAt: string;
}

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { user } = useAuthStore();
  const { mode, setMode } = useThemeStore();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useDialogBehavior(showNotifs, () => setShowNotifs(false));

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get("/notifications");
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.unreadCount);
    } catch {
      // Silently fail — notifications are non-critical
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => {
      if (!document.hidden) fetchNotifications();
    }, 30000);
    const onVisibility = () => {
      if (!document.hidden) fetchNotifications();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchNotifications]);

  const markAsRead = async (id: number) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  };

  const markAllRead = async () => {
    try {
      await api.put("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const openNotification = async (notification: Notification) => {
    if (!notification.read) await markAsRead(notification.id);
    setShowNotifs(false);
    if (notification.linkUrl) {
      const path = notification.linkUrl.startsWith("/panel/") ? notification.linkUrl : `/panel${notification.linkUrl.startsWith("/") ? notification.linkUrl : `/${notification.linkUrl}`}`;
      navigate(path);
    }
  };

  return (
    <header className="h-16 bg-dark-900/50 border-b border-dark-700/50 flex items-center justify-between px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-2 text-gray-400 hover:text-foreground hover:bg-dark-800 rounded-xl transition-all md:hidden"
        >
          <Menu size={20} />
        </button>
      </div>
      <div className="flex items-center gap-4">
        <div
          className="flex items-center gap-1 p-1 bg-dark-800/60 border border-dark-700/50 rounded-xl"
          role="group"
          aria-label="Tema de la interfaz"
        >
          <button
            onClick={() => setMode("light")}
            title="Tema claro"
            aria-label="Tema claro"
            aria-pressed={mode === "light"}
            className={`p-1.5 rounded-lg transition-all ${mode === "light" ? "bg-dark-700/60 text-gray-100" : "text-gray-400 hover:text-gray-200 hover:bg-dark-700/30"}`}
          >
            <Sun size={16} />
          </button>
          <button
            onClick={() => setMode("dark")}
            title="Tema oscuro"
            aria-label="Tema oscuro"
            aria-pressed={mode === "dark"}
            className={`p-1.5 rounded-lg transition-all ${mode === "dark" ? "bg-dark-700/60 text-gray-100" : "text-gray-400 hover:text-gray-200 hover:bg-dark-700/30"}`}
          >
            <Moon size={16} />
          </button>
          <button
            onClick={() => setMode("system")}
            title="Sigue el tema del sistema"
            aria-label="Tema del sistema"
            aria-pressed={mode === "system"}
            className={`p-1.5 rounded-lg transition-all ${mode === "system" ? "bg-dark-700/60 text-gray-100" : "text-gray-400 hover:text-gray-200 hover:bg-dark-700/30"}`}
          >
            <Monitor size={16} />
          </button>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            aria-label="Notificaciones"
            aria-expanded={showNotifs}
            className="relative p-2 text-gray-400 hover:text-foreground hover:bg-dark-800 rounded-xl transition-all"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-primary-600 text-white text-xs font-bold rounded-full px-1">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {showNotifs && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifs(false)} aria-hidden="true" />
              <div ref={notifRef} role="dialog" aria-label="Notificaciones" className="absolute right-0 top-full mt-1 z-50 w-80 max-h-96 bg-dark-800 border border-dark-700/50 rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700/50">
                  <h4 className="text-foreground font-medium text-sm">Notificaciones</h4>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} aria-label="Marcar todas como leídas" className="text-xs text-primary-400 hover:text-primary-300 transition-colors">
                        <CheckCheck size={14} />
                      </button>
                    )}
                    <button onClick={() => setShowNotifs(false)} aria-label="Cerrar notificaciones" className="text-gray-400 hover:text-foreground transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="overflow-y-auto max-h-80">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-gray-500 text-sm">Sin notificaciones</div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => openNotification(n)}
                        className={`w-full text-left px-4 py-3 border-b border-dark-700/30 cursor-pointer transition-colors ${
                          n.read ? "hover:bg-dark-700/20" : "bg-primary-600/5 hover:bg-primary-600/10"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {!n.read && <span className="w-2 h-2 mt-1.5 bg-primary-500 rounded-full flex-shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <span className={`block text-xs font-medium ${n.read ? "text-gray-400" : "text-foreground"}`}>{n.title}</span>
                            <span className="block text-xs text-gray-500 mt-0.5 truncate">{n.message}</span>
                            <span className="block text-xs text-gray-600 mt-1">{new Date(n.createdAt).toLocaleString("es-BO")}</span>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 pl-4 border-l border-dark-700/50">
          <div className="w-9 h-9 bg-primary-600/10 border border-primary-600/20 rounded-xl flex items-center justify-center">
            <User size={18} className="text-primary-400" />
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-foreground">{user?.name || "Usuario"}</p>
            <p className="text-xs text-gray-500">{user?.role || "Sin rol"}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
