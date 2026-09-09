import { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="studio-recovery">
        <AlertCircle size={32} />
        <h1>This view couldn’t open.</h1>
        <p>
          Your saved files remain on this computer. Reload the studio to reopen
          the library. Changes you hadn’t saved may need to be entered again.
        </p>
        <Button
          onClick={() => {
            window.location.hash = "library";
            window.location.reload();
          }}
        >
          <RefreshCw size={16} /> Reload studio
        </Button>
        <a href="/api/backup" className="button button-secondary">
          Download saved metadata
        </a>
      </main>
    );
  }
}
