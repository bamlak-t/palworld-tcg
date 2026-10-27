import { useCallback, useSyncExternalStore } from 'react';

/** True while the media query matches (false during prerender). */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True below Tailwind's md breakpoint. */
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
