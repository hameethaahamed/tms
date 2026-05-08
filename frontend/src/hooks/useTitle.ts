import { useEffect } from 'react';

export function useTitle(page: string) {
  useEffect(() => {
    document.title = `${page} | Testly`;
    return () => { document.title = 'Testly — Test Management Tool'; };
  }, [page]);
}
