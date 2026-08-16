import clsx from 'clsx';

export default function QuickActionCard({ label, icon: Icon, color = 'blue' }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600 hover:bg-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100',
    amber: 'bg-amber-50 text-amber-600 hover:bg-amber-100',
    purple: 'bg-purple-50 text-purple-600 hover:bg-purple-100',
    sky: 'bg-sky-50 text-sky-600 hover:bg-sky-100',
    indigo: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100',
  };

  return (
    <button
      className={clsx(
        'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 w-full text-left',
        colorMap[color] || colorMap.blue
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="text-[13px] font-medium">{label}</span>
    </button>
  );
}
