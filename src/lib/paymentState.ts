export type PaymentStateKey = 'AWAITING_POP' | 'POP_RECEIVED' | 'PAID' | 'NO_PAYMENT';

export const paymentStateMeta: Record<PaymentStateKey, { label: string; color: string }> = {
  AWAITING_POP: { label: 'Awaiting POP', color: '#5e696e' },
  POP_RECEIVED: { label: 'POP received', color: '#e78c07' },
  PAID: { label: 'Paid', color: 'var(--fiori-positive)' },
  NO_PAYMENT: { label: 'No payment due', color: '#427cac' },
};

export function getPaymentState(status: string, popUrlDriver: string | null, feeAmount?: number): PaymentStateKey {
  if (status === 'PAID') return 'PAID';
  if (feeAmount !== undefined && feeAmount <= 0) return 'NO_PAYMENT';
  if (popUrlDriver) return 'POP_RECEIVED';
  return 'AWAITING_POP';
}