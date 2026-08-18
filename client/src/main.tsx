import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./ui/theme.css";

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; message: string; stack: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "", stack: "" };
  }

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, message: String((error as Error)?.message ?? error ?? "Unknown error"), stack: "" };
  }

  componentDidCatch(error: unknown) {
    this.setState((prev) => ({ ...prev, stack: String((error as Error)?.stack ?? "") }));
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="jc-main">
          <section className="jc-card">
            <h2 className="jc-card-title">화면 렌더링 오류</h2>
            <p className="jc-muted">{this.state.message}</p>
            {this.state.stack && (
              <pre className="jc-debug-body" style={{ whiteSpace: "pre-wrap" }}>
                {this.state.stack}
              </pre>
            )}
            <button type="button" className="jc-btn" data-variant="primary" onClick={() => window.location.reload()}>
              새로고침
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

const container = document.getElementById("root");
if (!container) throw new Error("#root element not found");

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
