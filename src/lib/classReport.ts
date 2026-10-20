import { getPaymentState } from '@/lib/paymentState';

export const REPORT_SELECT = `
  id, race_number, sponsor, is_late_entry, fee_amount, status, pop_url_driver,
  drivers(full_name, email, mobile, msa_licence_no, wpmc_member_no),
  vehicles(make, model, year),
  race_classes(name),
  race_subclasses(name),
  entryFee(description),
  payments(amount_paid)
`;

export interface ReportEntry {
  id: string;
  race_number: string;
  sponsor: string | null;
  is_late_entry: boolean;
  fee_amount: number;
  status: string;
  pop_url_driver: string | null;
  drivers: {
    full_name: string;
    email: string;
    mobile: string;
    msa_licence_no: string;
    wpmc_member_no: string | null;
  } | null;
  vehicles: { make: string; model: string; year: number } | null;
  race_classes: { name: string } | null;
  race_subclasses: { name: string } | null;
  entryFee: { description: string | null } | null;
  payments: { amount_paid: number }[];
}

export interface ClassGroup {
  className: string;
  entries: ReportEntry[];
  paid: number;
  popReceived: number;
  awaiting: number;
  noPayment: number;
}

export function groupByClass(entries: ReportEntry[]): ClassGroup[] {
  const map = new Map<string, ClassGroup>();

  for (const e of entries) {
    const className = e.race_classes?.name ?? 'Unassigned';
    let group = map.get(className);
    if (!group) {
      group = { className, entries: [], paid: 0, popReceived: 0, awaiting: 0, noPayment: 0 };
      map.set(className, group);
    }
    group.entries.push(e);

    const state = getPaymentState(e.status, e.pop_url_driver, e.fee_amount);
    if (state === 'PAID') group.paid += 1;
    else if (state === 'POP_RECEIVED') group.popReceived += 1;
    else if (state === 'NO_PAYMENT') group.noPayment += 1;
    else group.awaiting += 1;
  }

  const groups = Array.from(map.values()).sort((a, b) => a.className.localeCompare(b.className));
  for (const g of groups) {
    g.entries.sort(
      (a, b) =>
        (a.race_subclasses?.name ?? '').localeCompare(b.race_subclasses?.name ?? '') ||
        a.race_number.localeCompare(b.race_number, undefined, { numeric: true })
    );
  }
  return groups;
}

export function vehicleText(v: ReportEntry['vehicles']): string {
  return v ? `${v.year} ${v.make} ${v.model}` : '';
}

export function sumPaid(e: ReportEntry): number {
  return e.payments.reduce((sum, p) => sum + p.amount_paid, 0);
}

export function reportFileName(eventName: string, eventDate: string): string {
  const slug =
    eventName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'event';
  return `entry-list-${slug}-${eventDate}.xlsx`;
}