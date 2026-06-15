import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiUrl } from "@/lib/queryClient";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
    this.reportClientError(error, errorInfo);
  }

  reportClientError(error: Error, errorInfo: ErrorInfo) {
    try {
      fetch(apiUrl("/api/platform/incidents/report"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Ошибка интерфейса: ${error.name || "Error"}`,
          message: error.message || String(error),
          type: "bug",
          severity: "high",
          source: "client-error",
          metadata: {
            stack: error.stack,
            componentStack: errorInfo.componentStack,
            path: window.location.pathname,
            userAgent: navigator.userAgent,
          },
        }),
      }).catch(() => {});
    } catch {
      // Ошибка репорта не должна ломать fallback-экран.
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl border-red-200 dark:border-red-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-8 h-8 text-red-500 dark:text-red-400" />
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  Произошла ошибка
                </h2>
              </div>
              
              {this.state.error && (
                <div className="mb-4 p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-sm font-mono text-red-800 dark:text-red-300 break-all">
                    {this.state.error.toString()}
                  </p>
                  {this.state.errorInfo && (
                    <details className="mt-2">
                      <summary className="text-xs text-red-600 dark:text-red-400 cursor-pointer">
                        Детали ошибки
                      </summary>
                      <pre className="mt-2 text-xs text-red-700 dark:text-red-400 overflow-auto max-h-64 p-2 bg-red-100 dark:bg-red-950/40 rounded">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <Button onClick={this.handleReset} variant="default">
                  Попробовать снова
                </Button>
                <Button
                  onClick={() => window.location.reload()}
                  variant="outline"
                >
                  Обновить страницу
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

