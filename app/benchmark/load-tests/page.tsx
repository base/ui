import { redirect } from 'next/navigation';

import { DEFAULT_LOAD_TEST_NETWORK, loadTestsHref } from '../routes';

// Load tests are always scoped to a network; default to the one upstream did.
export default function LoadTestsPage() {
  redirect(loadTestsHref(DEFAULT_LOAD_TEST_NETWORK));
}
