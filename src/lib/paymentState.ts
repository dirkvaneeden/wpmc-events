export type PaymentStateKey = 'AWAITING_POP' | 'POP_RECEIVED' | 'PAID';

export const paymentStateMeta: Record<PaymentStateKey, { label: string; color: string }> = {
  AWAITING_POP: { label: 'Awaiting POP', color: '#5e696e' },
  POP_RECEIVED: { label: 'POP received', color: '#e78c07' },
  PAID: { label: 'Paid', color: 'var(--fiori-positive)' },
};

export function getPaymentState(status: string, popUrlDriver: string | null): PaymentStateKey {
  if (status === 'PAID') return 'PAID';
  if (popUrlDriver) return 'POP_RECEIVED';
  return 'AWAITING_POP';
}