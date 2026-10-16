const LABEL: Record<string, string> = {
  measured: 'Measured', modeled: 'Modeled', estimated: 'Estimated',
  'not-measured': 'Not measured', 'not-modeled': 'Not modeled', 'not-established': 'Not established',
  provisional: 'Provisional', unset: 'Unset',
  da: 'DA', execution: 'Execution', state: 'State', networking: 'Networking',
};

export function Tag({ tag }: { tag: string }) {
  return (
    <span className="rounded-md border border-dashed border-bds-gray-40 px-2 py-0.5 text-[12px] text-bds-gray-60">{LABEL[tag] ?? tag}</span>
  );
}
