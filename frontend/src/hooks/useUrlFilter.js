import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

// A dropdown filter that lives in the URL, so a card or a notification can send someone straight to
// "just the inactive ones" instead of to the top of a list they then have to filter themselves.
//
// Same reasoning as useUrlSearch: the module keeps its own control, but arriving with ?status=Inactive
// arrives already filtered, and the URL always shows what is actually on screen. Writing the param
// back on every change means a reload keeps the view and the address can be shared or bookmarked.
//
// The param is only written when it differs from the default, so ordinary use never litters the
// address bar with ?status=All.
export default function useUrlFilter(name, defaultValue) {
  const [params, setParams] = useSearchParams();
  const urlValue = params.get(name);
  const [value, setValue] = useState(urlValue || defaultValue);

  // Re-sync when the URL changes underneath us (a card link landing on this page while it is already
  // mounted). Adjusting during render rather than in an effect avoids showing the stale filter for a
  // frame after the route changed.
  const [lastUrlValue, setLastUrlValue] = useState(urlValue);
  if (lastUrlValue !== urlValue) {
    setLastUrlValue(urlValue);
    setValue(urlValue || defaultValue);
  }

  const setFilter = useCallback((next) => {
    setValue(next);
    const next2 = new URLSearchParams(params);
    if (next && next !== defaultValue) next2.set(name, next);
    else next2.delete(name);
    setParams(next2, { replace: true });
  }, [params, setParams, name, defaultValue]);

  return [value, setFilter];
}
