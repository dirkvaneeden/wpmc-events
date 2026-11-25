export type RoundingMode = 'up' | 'down' | 'decimals';

export const REVIEW_MONTHS = 3;

export const roundingLabels: Record<RoundingMode, string> = {
  up: 'Round up to the rand',
  down: 'Round down to the rand',
  decimals: 'Keep decimals',
};

// Mirrors round_price() in the database so previews match what is saved.
export function roundPrice(value: number, mode: RoundingMode): number {
  if (mode === 'up') return Math.ceil(value - 1e-9);
  if (mode === 'down') return Math.floor(value + 1e-9);
  return Math.round(value * 100) / 100;
}

export function reducedPrice(price: number, pct: number, mode: RoundingMode): number {
  return roundPrice(price * (1 - pct / 100), mode);
}

export function increasedPrice(price: number, pct: number, mode: RoundingMode): number {
  return roundPrice(price * (1 + pct / 100), mode);
}

// The date a price is next due for review (last change + 3 months).
export function reviewDueDate(priceUpdatedAt: string): Date {
  const d = new Date(priceUpdatedAt);
  d.setMonth(d.getMonth() + REVIEW_MONTHS);
  return d;
}

export function isReviewDue(priceUpdatedAt: string, now: Date = new Date()): boolean {
  return reviewDueDate(priceUpdatedAt).getTime() <= now.getTime();
}

export function formatRand(value: number): string {
  const [whole, cents] = value.toFixed(2).split('.');
  return `R ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${cents}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 2026 + 52311 -> "26/52311"
export function formatMemberNo(year: number, seq: number): string {
  return `${String(year % 100).padStart(2, '0')}/${String(seq).padStart(5, '0')}`;
}

// "26/52310" -> { prefix: 26, seq: 52310 } or null
export function parseMemberNo(value: string): { prefix: number; seq: number } | null {
  const m = /^(\d{2})\/(\d{5})$/.exec(value.trim());
  if (!m) return null;
  return { prefix: Number(m[1]), seq: Number(m[2]) };
}
