// Loads data for a view and tracks its state: { status, data, error, reload }.
// status is 'loading' | 'success' | 'error', which is what every data view switches on to
// show its loading, error, empty or content state.
//
// `load` is a function returning a promise (e.g. () => api.workouts.list({ limit: 10 })).
// `deps` works like useEffect's dependency list: when a value in it changes (a different
// date, a different page), the data loads again. Deps must be plain values (strings,
// numbers), because they're combined into a key with JSON.stringify.
import { useEffect, useState } from 'react';

export function useApiData(load, deps) {
  const [reloadCount, setReloadCount] = useState(0);
  // Identifies "the request we want right now". Changing a dep or calling reload() makes a
  // new key, and with it a new request.
  const requestKey = JSON.stringify([...deps, reloadCount]);
  // The last finished request: which key it was for, and what came back.
  const [result, setResult] = useState({ key: null, data: null, error: null });

  useEffect(() => {
    // If the key changes while a request is still in flight, the old response must not
    // overwrite the new one: this flag ignores answers to outdated requests.
    let ignore = false;
    load().then(
      (data) => !ignore && setResult({ key: requestKey, data, error: null }),
      (error) => !ignore && setResult({ key: requestKey, data: null, error }),
    );
    return () => {
      ignore = true;
    };
    // `load` is a new function on every render, so it's deliberately left out; the caller
    // lists the values it actually depends on in `deps`, and those are in requestKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  // "Loading" isn't stored; it's derived: the latest result answers an older key.
  // While loading, `data` still holds the previous result, so a page can keep showing it
  // during a reload instead of flashing a spinner.
  const settled = result.key === requestKey;
  let status = 'loading';
  if (settled) status = result.error ? 'error' : 'success';

  return {
    status,
    data: result.data,
    error: settled ? result.error : null,
    reload: () => setReloadCount((n) => n + 1),
  };
}
