import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useToast } from '../components/Toast';
import { errorMessage } from './api';

export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

interface ActionOptions<TData, TVars> {
  success?: string | ((data: TData, vars: TVars) => string);
  invalidate?: QueryKey[];
  onSuccess?: (data: TData, vars: TVars) => void;
}

/** Mutation + toast + cache invalidation in one call. */
export function useAction<TVars = void, TData = unknown>(fn: (vars: TVars) => Promise<TData>, opts: ActionOptions<TData, TVars> = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, vars) => {
      for (const key of opts.invalidate ?? []) qc.invalidateQueries({ queryKey: key });
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(data, vars) : opts.success);
      opts.onSuccess?.(data, vars);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/** Query keys invalidated by any catalogue/stock change. */
export const CATALOG_KEYS: QueryKey[] = [['products'], ['product'], ['inventory'], ['dashboard'], ['categories']];
