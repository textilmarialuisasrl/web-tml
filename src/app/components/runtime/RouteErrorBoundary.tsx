import { Component, type ErrorInfo, type ReactNode } from "react";
import { metricsService } from "../../services/metrics.service";
import { DegradedScreen } from "./DegradedScreen";

interface Props {
  children: ReactNode;
  routeName: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class RouteErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[Route ${this.props.routeName}]`, error, errorInfo);
    void metricsService.trackMetric("route_boundary_error", 1, {
      route: this.props.routeName,
      message: error.message,
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <DegradedScreen
          mode="route"
          errorMessage={this.state.error?.message}
          onRetryRoute={this.handleRetry}
        />
      );
    }
    return this.props.children;
  }
}

export default RouteErrorBoundary;
