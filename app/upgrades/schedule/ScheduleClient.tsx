'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { Card } from '../../components/ui/Card';
import { Text } from '../../components/ui/Text';
import { upgrades } from '../data/upgrades';
import { NETWORK_LABELS, UPGRADE_NETWORKS } from '../library/display';
import type { Lifecycle } from '../library/types';

type UpgradeNetwork = keyof Lifecycle;

type CalendarEvent = {
  upgradeId: string;
  upgradeName: string;
  network: UpgradeNetwork;
};

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function networkClasses(network: UpgradeNetwork) {
  switch (network) {
    case 'sepolia':
      return 'bg-bds-yellow-30 text-bds-gray-100';
    case 'mainnet':
      return 'bg-bds-green-30 text-bds-gray-100';
    default:
      return 'bg-bds-green-30 text-bds-gray-100';
  }
}

export function buildEventsByDate(): Record<string, CalendarEvent[]> {
  const map: Record<string, CalendarEvent[]> = {};
  for (const upgrade of upgrades) {
    for (const network of UPGRADE_NETWORKS) {
      const entry = upgrade.lifecycle[network];
      if (entry.timestamp) {
        const dateKey = entry.timestamp.slice(0, 10);
        map[dateKey] ??= [];
        map[dateKey].push({
          upgradeId: upgrade.id,
          upgradeName: upgrade.name,
          network,
        });
      }
    }
  }
  return map;
}

type GridCell = {
  date: Date | null;
  key: string;
};

function getMonthGrid(year: number, month: number): GridCell[] {
  const startDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: GridCell[] = [];
  for (let lead = 0; lead < startDay; lead += 1) {
    cells.push({ date: null, key: `${year}-${month}-lead-${lead}` });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: new Date(year, month, day), key: `${year}-${month}-day-${day}` });
  }
  let trail = 0;
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, key: `${year}-${month}-trail-${trail}` });
    trail += 1;
  }
  return cells;
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function ScheduleClient() {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const eventsByDate = useMemo(() => buildEventsByDate(), []);
  const cells = useMemo(() => getMonthGrid(year, month), [month, year]);
  const todayKey = toDateKey(today);
  const weeks: GridCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  function previousMonth() {
    if (month === 0) {
      setYear((value) => value - 1);
      setMonth(11);
      return;
    }
    setMonth((value) => value - 1);
  }

  function nextMonth() {
    if (month === 11) {
      setYear((value) => value + 1);
      setMonth(0);
      return;
    }
    setMonth((value) => value + 1);
  }

  return (
    <>
      <Card className="overflow-hidden bg-white dark:bg-white/5">
        <div className="flex items-center justify-between border-b border-bds-gray-10 px-4 py-4 dark:border-white/10 md:px-6">
          <button
            type="button"
            onClick={previousMonth}
            aria-label="Previous month"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-bds-gray-10 text-bds-gray-60 transition-colors hover:bg-bds-gray-5 dark:border-white/10 dark:text-bds-gray-20 dark:hover:bg-white/10"
          >
            <span aria-hidden>&lt;</span>
          </button>
          <Text variant="headline">
            {MONTH_NAMES[month]} {year}
          </Text>
          <button
            type="button"
            onClick={nextMonth}
            aria-label="Next month"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-bds-gray-10 text-bds-gray-60 transition-colors hover:bg-bds-gray-5 dark:border-white/10 dark:text-bds-gray-20 dark:hover:bg-white/10"
          >
            <span aria-hidden>&gt;</span>
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-bds-gray-10 dark:border-white/10">
          {DAY_NAMES.map((day) => (
            <Text
              key={day}
              variant="footnote"
              tone="muted"
              className="py-3 text-center font-mono uppercase"
            >
              {day}
            </Text>
          ))}
        </div>

        {weeks.map((week) => {
          const weekKey = week[0].key;
          return (
            <div
              key={weekKey}
              className="grid grid-cols-7 border-b border-bds-gray-10 last:border-b-0 dark:border-white/10"
            >
              {week.map((cell) => {
                if (!cell.date) {
                  return (
                    <div
                      key={cell.key}
                      className="min-h-[92px] border-r border-bds-gray-10 bg-bds-gray-5 last:border-r-0 dark:border-white/10 dark:bg-white/5 md:min-h-[118px]"
                    />
                  );
                }
                const { date } = cell;
                const dateKey = toDateKey(date);
                const events = eventsByDate[dateKey] ?? [];
                const isToday = dateKey === todayKey;
                return (
                  <div
                    key={dateKey}
                    className="min-h-[92px] border-r border-bds-gray-10 p-2 last:border-r-0 dark:border-white/10 md:min-h-[118px]"
                  >
                    <div className="mb-2 flex justify-end">
                      <span
                        className={
                          isToday
                            ? 'flex h-7 w-7 items-center justify-center rounded-full bg-base-blue text-[13px] text-white'
                            : 'text-[13px] text-bds-gray-50'
                        }
                      >
                        {date.getDate()}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {events.map((event) => (
                        <Link
                          key={`${event.upgradeId}-${event.network}`}
                          href={`/upgrades/upgrade/${event.upgradeId}`}
                          title={`${event.upgradeName} ${NETWORK_LABELS[event.network]}`}
                          className={`truncate rounded px-2 py-1 text-[11px] leading-none transition-opacity hover:opacity-80 ${networkClasses(event.network)}`}
                        >
                          {event.upgradeName} {NETWORK_LABELS[event.network]}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </Card>

      <div className="mt-5 flex flex-wrap items-center gap-5">
        {UPGRADE_NETWORKS.map((network) => (
          <div key={network} className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-sm ${networkClasses(network).split(' ')[0]}`} />
            <Text variant="label.regular" tone="muted">
              {NETWORK_LABELS[network]}
            </Text>
          </div>
        ))}
      </div>
    </>
  );
}
