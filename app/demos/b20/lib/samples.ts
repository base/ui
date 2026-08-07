// Read-only sample data shown in the B20 demo before a user deploys their own
// token. Kept out of the components so the copy is easy to review/revise in one
// place and the render functions stay presentational.

export type SampleAnnouncement = {
  id: string;
  type: string;
  title: string;
  description: string;
  uri: string;
  effective: string;
  call: string;
};

export const SAMPLE_ANNOUNCEMENTS: SampleAnnouncement[] = [
  {
    id: '2027-Q1-split',
    type: 'Scheduled token update',
    title: '2027 Q1 Forward Split',
    description: 'A 2:1 forward split that changes displayed balances without rewriting raw token balances.',
    uri: 'https://example.com/disclosures/2027-q1-split',
    effective: '15 Jan 2027, 09:00 UTC',
    call: 'setUIMultiplier(2e18, 1800003600)',
  },
  {
    id: '2026-Q4-reserves',
    type: 'Disclosure only',
    title: 'Quarterly Reserve Attestation',
    description: 'The issuer published its quarterly reserve attestation without changing token state.',
    uri: 'https://example.com/disclosures/2026-q4-reserves',
    effective: 'Published 20 Dec 2026',
    call: 'No internal calls',
  },
];
