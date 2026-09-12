import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import api from "../services/api";
import toast from "react-hot-toast";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data } = await api.post("/auth/login", { email, password });
      await login(data.user, data.token);
      toast.success(`Bienvenido, ${data.user.name}`);
      navigate("/panel");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-600/5 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-[128px]" />
      </div>

      {/* Back button */}
      <Link
        to="/"
        className="absolute top-6 left-6 z-10 flex items-center gap-2 text-gray-400 hover:text-foreground transition-colors"
      >
        <ArrowLeft size={18} />
        <span className="text-sm">Volver</span>
      </Link>

      <div className="relative z-10 w-full max-w-md px-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-600/20 overflow-hidden">
            <img src="/fercar-logo.png" alt="Shibumi" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Shibumi</h1>
          <p className="text-gray-400 text-sm mt-1">Sistema de Inventario y Ventas</p>
        </div>

        {/* Login card */}
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-8 backdrop-blur-sm">
          <h2 className="text-xl font-semibold text-foreground mb-1">Iniciar Sesión</h2>
          <p className="text-gray-400 text-sm mb-6">Ingresa tus credenciales para acceder</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-gray-300 mb-2">
                Correo electrónico
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full px-4 py-3 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                placeholder="correo@ejemplo.com"
                required
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-gray-300 mb-2">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full px-4 py-3 bg-dark-900/50 border border-dark-600/50 rounded-xl text-foreground placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all pr-12"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary-600/20 hover:shadow-primary-600/30"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Ingresando...
                </span>
              ) : (
                "Ingresar"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-500 text-xs mt-6">
          &copy; 2026 Shibumi. Sistema de Inventario.
        </p>
      </div>
    </div>
  );
}
