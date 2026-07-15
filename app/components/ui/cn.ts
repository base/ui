import type { ArgumentArray } from 'classnames';
import classnames from 'classnames';
import { twMerge } from 'tailwind-merge';

// Merge conditional class names and de-dupe conflicting Tailwind utilities.
export function cn(...inputs: ArgumentArray) {
  return twMerge(classnames(...inputs));
}
