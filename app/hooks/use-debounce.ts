"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function useDebouncedCallback<T extends (...args: never[]) => void>(
  callback: T,
  delay: number,
): T {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(callback);
  useEffect(() => {
    cb.current = callback;
  }, [callback]);

  const call = useCallback((...args: Parameters<T>) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => cb.current(...args), delay);
  }, [delay]);

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  return call as T;
}
