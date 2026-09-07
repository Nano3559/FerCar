import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { hasError: boolean; message: string }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Error de renderizado:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center p-6">
        <div className="max-w-md text-center bg-dark-800 border border-red-500/20 rounded-2xl p-6">
          <h1 className="text-xl font-bold text-foreground mb-2">Ocurrió un error inesperado</h1>
          <p className="text-sm text-gray-400 mb-5">Recarga la página para continuar.</p>
          {import.meta.env.DEV && <p className="text-xs text-red-400 mb-4 break-words">{this.state.message}</p>}
          <button onClick={() => window.location.reload()} className="px-4 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-medium">Recargar</button>
        </div>
      </div>
    );
  }
}
