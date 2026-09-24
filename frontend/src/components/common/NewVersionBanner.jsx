import { RefreshCw } from 'lucide-react';
import useNewVersion from '../../hooks/useNewVersion';

// Shown when the system was updated while this tab was open. It asks instead of reloading by itself, so
// nobody loses a half-filled form; the old screens keep working until they reload.
export default function NewVersionBanner() {
  const outdated = useNewVersion();
  if (!outdated) return null;

  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 flex items-center gap-3 rounded-2xl bg-[#0B1F3A] px-5 py-3 text-sm text-white shadow-2xl">
      <RefreshCw className="h-4 w-4 text-blue-300" />
      <span>WorkForce Pro was updated. Reload to use the new version.</span>
      <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] hover:bg-blue-50">
        Reload
      </button>
    </div>
  );
}
