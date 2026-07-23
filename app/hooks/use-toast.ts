"use client";

import { useState, useCallback } from "react";
import { TOAST_DURATION_MS } from "../api/_lib/constants";

export function useToast() {
  const [notice, setNotice] = useState("");

  const toast = useCallback((message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(""), TOAST_DURATION_MS);
  }, []);

  return { notice, toast };
}
