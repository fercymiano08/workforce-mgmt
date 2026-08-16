import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from './ui/Button';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-[#0B1F3A] via-[#0E2747] to-[#0B1F3A] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 sm:p-10 text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mt-4">Something went wrong</h2>
            <p className="text-sm text-gray-500 mt-1.5">
              The application hit an unexpected error. Reload to continue.
            </p>
            <Button size="lg" className="mt-8 w-full" onClick={this.handleReload}>
              Reload
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
