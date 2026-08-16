import BrandLogo from '../ui/BrandLogo';

// Minimal chrome for focused, single-task flows (e.g. Employee Registration)
// that shouldn't compete with the sidebar/topbar for attention. Keeps just
// enough branding that the page still reads as part of the app, not a
// standalone/broken screen - the page itself is responsible for its own
// "back"/"cancel" affordance.
export default function FocusLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="h-[72px] px-6 lg:px-8 flex items-center gap-3 bg-[#0B1F3A] flex-shrink-0 shadow-lg shadow-blue-900/10">
        <BrandLogo variant="icon" />
        <div>
          <h1 className="font-bold text-lg leading-tight tracking-tight uppercase text-red-500">ARCHON NELL</h1>
          <p className="text-blue-300 text-[11px] font-medium uppercase tracking-[0.25em]">INCORPORATED</p>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
