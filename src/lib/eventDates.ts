// Event dates are stored as YYYY-MM-DD with no time zone. Parsing them by hand
// stops the browser shifting a date by a day.

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(date: string): string {
  return parse(date).toLocaleDateString();
}

export function todayString(): string {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

export function lastDay(startDate: string, endDate?: string | null): string {
  return endDate && endDate >= startDate ? endDate : startDate;
}

export function formatEventDates(startDate: string, endDate?: string | null): string {
  const end = lastDay(startDate, endDate);
  return end === startDate ? formatDate(startDate) : `${formatDate(startDate)} – ${formatDate(end)}`;
}

export type EventPhase = 'UPCOMING' | 'RUNNING' | 'PAST';

export function eventPhase(startDate: string, endDate?: string | null, today: string = todayString()): EventPhase {
  const end = lastDay(startDate, endDate);
  if (end < today) return 'PAST';
  if (startDate > today) return 'UPCOMING';
  return 'RUNNING';
}