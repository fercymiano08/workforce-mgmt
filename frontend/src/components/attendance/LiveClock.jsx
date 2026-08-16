import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

export default function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const weekday = now.toLocaleDateString('en-US', { weekday: 'short' });
  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="flex items-center gap-2 text-sm text-gray-500 bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm">
      <Clock className="w-4 h-4 text-blue-500" />
      <span className="font-semibold text-gray-900">{weekday}</span>
      <span className="text-gray-300">·</span>
      <span className="font-medium">{date}</span>
      <span className="text-gray-300">·</span>
      <span className="font-medium text-blue-600 tabular-nums">{time}</span>
    </div>
  );
}
