import { useEffect, useState } from 'react';

// Loads an async service call into state with a refresh() helper.
export default function useApiData(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = () => {
    setLoading(true);
    setError(null);
    fetcher()
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => {
        setError(err?.response?.data?.message || err?.message || 'Failed to load data');
        setData(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    fetcher()
      .then((res) => {
        if (!active) return;
        setData(res);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.response?.data?.message || err?.message || 'Failed to load data');
        setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refresh, setData };
}
