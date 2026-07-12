"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("service worker registration failed:", err);
      });
    }
  }, []);
  return null;
}
