import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { GlamsterdamComparisonSection } from './GlamsterdamComparison';

it('shows the benchmark source setup message when comparisons are unavailable', () => {
  const html = renderToStaticMarkup(<GlamsterdamComparisonSection configured={false} />);
  expect(html, 'the section should explain why comparison data is unavailable').toContain('Benchmark source is not configured.');
});
