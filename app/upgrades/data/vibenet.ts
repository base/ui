import type { Change, LifecycleState } from '../library/types';

import { getChangeById } from './changes';

type FeaturedChangePresentation = {
  image?: string;
};

type VibenetAvailability = FeaturedChangePresentation & {
  changeId: string;
  status: LifecycleState;
  timestamp?: string;
  featured?: boolean;
};

const vibenetAvailability = [
  {
    changeId: 'eip-8130',
    status: 'live',
    timestamp: '2026-07-02',
    featured: true,
    image: '/images/upgrades/layered-squares.png',
  },
] as const satisfies VibenetAvailability[];

export type VibenetChange = Change &
  FeaturedChangePresentation & {
    vibenet: {
      status: LifecycleState;
      timestamp?: string;
      featured: boolean;
    };
  };

export function getVibenetChanges(): VibenetChange[] {
  return vibenetAvailability.map(({ changeId, status, timestamp, featured = false, image }) => {
    const change = getChangeById(changeId);
    if (!change) throw new Error(`Vibenet change "${changeId}" was not found`);
    return {
      ...change,
      image,
      vibenet: {
        status,
        timestamp,
        featured,
      },
    };
  });
}

export function getFeaturedVibenetChanges(): VibenetChange[] {
  return getVibenetChanges().filter((change) => change.vibenet.featured);
}

export function getVibenetChangeById(changeId: string): VibenetChange | undefined {
  return getVibenetChanges().find((change) => change.id === changeId);
}
