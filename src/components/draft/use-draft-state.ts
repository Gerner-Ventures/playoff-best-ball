"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DraftState } from "@/lib/draft-state";

const POLL_MS = 4000;

/** Polls draft state while the draft is ACTIVE; refetch() forces an immediate update (after a pick). */
export function useDraftState(leagueId: string) {
  const [state, setState] = useState<DraftState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/leagues/${leagueId}/draft`);
      if (!res.ok) {
        setError("Couldn't load the draft.");
        return;
      }
      setState(await res.json());
      setError(null);
    } catch {
      setError("Couldn't reach the server.");
    }
  }, [leagueId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (state?.status !== "ACTIVE") {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      return;
    }
    if (!timer.current) {
      timer.current = setInterval(() => void refetch(), POLL_MS);
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [state?.status, refetch]);

  return { state, error, refetch };
}
