import { useEffect, useState } from "react";
import { createPoller, DEFAULT_TELEMETRY_URL, type PollerState } from "@/lib/osense/liveTelemetry";

const IDLE: PollerState = { status: "disconnected", latest: null, history: [], error: null, lastUpdate: null };

/** Polls the local Windows monitor only while `enabled` is true; cleans up on disable/unmount. */
export function useLiveTelemetry(enabled: boolean, baseUrl = DEFAULT_TELEMETRY_URL) {
  const [state, setState] = useState<PollerState>(IDLE);
  useEffect(() => {
    if (!enabled) {
      setState(IDLE);
      return;
    }
    const poller = createPoller({ baseUrl, top: 40, onChange: setState });
    return () => poller.stop();
  }, [enabled, baseUrl]);
  return state;
}
