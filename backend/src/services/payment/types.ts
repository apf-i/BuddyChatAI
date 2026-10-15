export type PaymentProviderName = 'nowpayments';

export interface CreateTokenCheckoutParams {
  purchaseId: string;
  userId: string;
  userEmail: string;
  amountCents: number;
  tokens: number;
  packageId: string;
  packageName: string;
}

export interface CreateSubscriptionCheckoutParams {
  userId: string;
  userEmail: string;
  planId: string;
  planName: string;
  amountCents: number;
  tokens: number;
}

export interface CheckoutResult {
  checkoutUrl: string;
  providerTransactionId?: string;
}

export interface TokenPurchaseIpnPayload {
  purchaseId: string;
  userId: string;
  tokens: number;
  amountCents: number;
  providerTransactionId: string;
}

export interface SubscriptionIpnPayload {
  userId: string;
  planId: string;
  tokens: number;
  priceCents: number;
  providerSubscriptionId: string;
  providerCustomerId?: string;
  status: 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing';
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  isRenewal?: boolean;
}

export interface PaymentProvider {
  name: PaymentProviderName;
  createTokenCheckout(params: CreateTokenCheckoutParams): Promise<CheckoutResult>;
  createSubscriptionCheckout(params: CreateSubscriptionCheckoutParams): Promise<CheckoutResult>;
  isConfigured(): boolean;
}
