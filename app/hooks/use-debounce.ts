"use client";

import { useEffect, useRef } from "react";

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

import { useState } from "react";

export function useDebouncedCallback<T extends (...args: never[]) => void>(
  callback: T,
  delay: number,
): T {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(callback);
  cb.current = callback;

  const call = useRef(((...args: never[]) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => cb.current(...args), delay);
  }) as T);

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  return call.current;
}
