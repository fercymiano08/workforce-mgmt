import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

// A text filter that the topbar's global search can drive. The module keeps its own search box, but
// arriving with ?search=<term> fills it in, and searching again from the topbar while already on the
// page replaces what is in it instead of being ignored the way a plain useState('') would be.
export default function useUrlSearch() {
  const [params, setParams] = useSearchParams();
  const urlTerm = params.get('search') || '';
  const [value, setValue] = useState(urlTerm);

  // Re-sync when the URL term changes underneath us (a new search from the topbar on this same page).
  // Adjusting during render rather than in an effect means the box never shows the old term for a
  // frame after the route changed.
  const [lastUrlTerm, setLastUrlTerm] = useState(urlTerm);
  if (lastUrlTerm !== urlTerm) {
    setLastUrlTerm(urlTerm);
    setValue(urlTerm);
  }

  // Editing the module's own box rewrites the query param too, so the two can never disagree and a
  // reload of the URL shows what is actually on screen. Only touch the URL if a search term is
  // already there, so ordinary typing does not fill the address bar with keystrokes.
  const setSearch = useCallback((next) => {
    setValue(next);
    if (urlTerm) {
      const next2 = new URLSearchParams(params);
      if (next) next2.set('search', next);
      else next2.delete('search');
      setParams(next2, { replace: true });
    }
  }, [params, setParams, urlTerm]);

  return [value, setSearch];
}
