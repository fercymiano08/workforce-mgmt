import Badge from '../ui/Badge';

// The small "Today" pill shown next to a date that is today, the same everywhere.
export default function TodayBadge({ children = 'Today' }) {
  return <Badge variant="primary" size="xs" dot>{children}</Badge>;
}
