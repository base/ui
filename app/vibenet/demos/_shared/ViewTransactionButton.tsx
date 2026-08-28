import { Button } from '../../../components/ui/Button';

type ViewTransactionButtonProps = {
  href: string;
  label?: string;
};

/** Consistent explorer action for completed transactions. Explorer details open
 * separately so closing the result dialog does not lose the current demo state. */
export function ViewTransactionButton({
  href,
  label = 'View Transaction',
}: ViewTransactionButtonProps) {
  return (
    <Button
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      variant="secondary"
      size="sm"
    >
      {label}
    </Button>
  );
}
