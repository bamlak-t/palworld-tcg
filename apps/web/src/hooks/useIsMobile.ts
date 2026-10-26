import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 767px)';

const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

/** True below Tailwind's md breakpoint. */
export const useIsMobile = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
