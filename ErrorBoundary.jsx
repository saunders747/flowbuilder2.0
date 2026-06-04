import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary caught]', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      const { fallback: Fallback, label = 'this section' } = this.props;
      if (Fallback) return <Fallback error={this.state.error} reset={() => this.setState({ error: null, errorInfo: null })} />;

      return (
        <Card className="border-destructive bg-destructive/5 m-4">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-destructive">⚠️ Something went wrong in {label}</p>
                <p className="text-xs text-muted-foreground mt-2">{this.state.error?.message || 'An unexpected error occurred.'}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => this.setState({ error: null, errorInfo: null })}
                  className="bg-primary hover:bg-primary/90">
                  Try again
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.location.reload()}>
                  Reload page
                </Button>
              </div>
              {import.meta.env.DEV && this.state.errorInfo && (
                <details className="mt-4 p-3 bg-muted rounded text-xs font-mono">
                  <summary className="cursor-pointer font-semibold mb-2">Stack trace (dev only)</summary>
                  <pre className="whitespace-pre-wrap break-words text-[10px] opacity-70">
                    {this.state.error?.stack}
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;