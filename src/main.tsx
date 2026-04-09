import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { cx } from "./styles.ts";

class AppErrorBoundary extends React.Component {
  props;
  state;
  setState;

  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "", stack: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: String(error?.message ?? error ?? "Unknown error") };
  }

  componentDidCatch(error) {
    this.setState({ stack: String(error?.stack ?? "") });
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className={cx("layout")}>
          <section className={cx("card")}>
            <h2>화면 렌더링 오류</h2>
            <p className={cx("muted")}>{this.state.message}</p>
            {this.state.stack && <pre className={cx("muted")}>{this.state.stack}</pre>}
            <button type="button" className={cx("action")} onClick={() => window.location.reload()}>
              새로고침
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
