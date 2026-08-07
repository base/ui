'use client';

import { useEffect, useRef, useState } from 'react';

import { Banner } from '../../components/ui/Banner';
import { vibenetApi } from '../library/client';

const POLL_MS = 20_000;
// Require this many consecutive unhealthy responses before showing the banner,
// so a single transient blip doesn't flash a maintenance notice at users.
const CONSECUTIVE_TO_SHOW = 2;

// Polls vibenet's chain-health endpoint and shows a maintenance notice when the
// L2 is unhealthy. Consumes the cross-origin dataplane API via `vibenetApi`
// (same pattern as the explorer live-poll). Reads only `healthy`; the fixed copy
// mirrors upstream, which no longer surfaces the specific `reason`/`detail`.
export function MaintenanceBanner() {
  const [visible, setVisible] = useState(false);
  const failStreak = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const body = await vibenetApi.chainHealth();
        if (cancelled) return;
        if (body.healthy) {
          failStreak.current = 0;
          setVisible(false);
        } else {
          failStreak.current += 1;
          if (failStreak.current >= CONSECUTIVE_TO_SHOW) setVisible(true);
        }
      } catch {
        // The health request itself failed. The page is clearly being served,
        // so treat this as inconclusive rather than flipping the banner on —
        // avoids false positives from transient network errors.
      } finally {
        if (!cancelled) timer = setTimeout(poll, POLL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;

  return (
    <Banner className="mb-6">
      <strong>Vibenet is down for maintenance.</strong> Please check back shortly.
    </Banner>
  );
}
