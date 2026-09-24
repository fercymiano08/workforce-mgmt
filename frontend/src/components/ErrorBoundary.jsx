import { Component } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import Button from './ui/Button';
import { latestBuild, RUNNING_BUILD } from '../hooks/useNewVersion';

// Remembers (per tab) which build we already reloaded into, so a crash can never cause a reload loop.
const RELOADED_KEY = 'wfp-reloaded-into-build';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, updating: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  async componentDidCatch(error, info) {
    console.error('App crashed:', error, info);

    // The most common cause after an update: this tab still runs the OLD screens while the server already
    // answers in the NEW format. If a newer build exists, reload into it once instead of showing an error.
    const latest = await latestBuild();
    let alreadyTried = null;
    try { alreadyTried = sessionStorage.getItem(RELOADED_KEY); } catch { /* storage blocked */ }
    if (latest && latest !== RUNNING_BUILD && alreadyTried !== latest) {
      try { sessionStorage.setItem(RELOADED_KEY, latest); } catch { /* storage blocked */ }
      this.setState({ updating: true });
      window.location.reload();
    }
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
              {this.state.updating ? <Loader2 className="w-8 h-8 text-blue-500 animate-spin" /> : <AlertTriangle className="w-8 h-8 text-red-500" />}
            </div>
            <h2 className="text-xl font-bold text-gray-900 mt-4">{this.state.updating ? 'Loading the new version…' : 'Something went wrong'}</h2>
            <p className="text-sm text-gray-500 mt-1.5">
              {this.state.updating
                ? 'WorkForce Pro was updated while this page was open.'
                : 'The application hit an unexpected error. Reload to continue. If the system was just updated, reloading loads the new version.'}
            </p>
            {!this.state.updating && (
              <Button size="lg" className="mt-8 w-full" onClick={this.handleReload}>
                Reload
              </Button>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
