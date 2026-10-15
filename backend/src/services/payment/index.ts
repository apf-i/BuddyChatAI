import { nowPaymentsProvider, isNowPaymentsConfigured } from './nowpayments';
import type { PaymentProvider } from './types';

export * from './types';
export * from './fulfillment';
export {
  nowPaymentsProvider,
  isNowPaymentsConfigured,
  verifyNowPaymentsIpnSignature,
  parseSubscriptionOrderId,
  subscriptionOrderId,
  getPaymentsByOrderId,
} from './nowpayments';

export function getPaymentProvider(): PaymentProvider {
  const name = process.env.PAYMENT_PROVIDER || 'nowpayments';
  if (name === 'nowpayments') {
    return nowPaymentsProvider;
  }
  throw new Error(`Unsupported PAYMENT_PROVIDER: ${name}. Use "nowpayments".`);
}
