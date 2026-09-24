import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { analyticsService } from '../services/api';
import { useAuth } from './AuthContext';

const InsightsContext = createContext(null);

// Loads the unresolved AI insight count once so the sidebar badge always knows
// how many problems still need HR attention - even before the AI Decision
// Support page has been visited. AIDecisionSupport calls refresh() whenever it
// resolves/restores an insight so the badge stays in sync.
export function InsightsProvider({ children }) {
  const { isAdmin, isAuthenticated } = useAuth();
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !isAdmin) return;
    try {
      const res = await analyticsService.getAiInsights();
      const insights = res?.insights ?? [];
      setUnresolvedCount(insights.filter((i) => !i.resolved && i.severity !== 'success').length);
    } catch {
      // intelligence service unreachable / not admin yet - keep last known count
    }
  }, [isAuthenticated, isAdmin]);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ unresolvedCount, refresh }), [unresolvedCount, refresh]);

  return <InsightsContext.Provider value={value}>{children}</InsightsContext.Provider>;
}

export function useInsights() {
  return useContext(InsightsContext);
}