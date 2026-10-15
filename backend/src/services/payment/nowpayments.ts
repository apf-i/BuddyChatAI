import crypto from 'crypto';
import type {
  CheckoutResult,
  CreateSubscriptionCheckoutParams,
  CreateTokenCheckoutParams,
  PaymentProvider,
} from './types';

const API_KEY = process.env.NOWPAYMENTS_API_KEY || '';
const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET || '';
const SANDBOX = process.env.NOWPAYMENTS_SANDBOX === 'true';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const API_BASE = SANDBOX ? 'https://api-sandbox.nowpayments.io/v1' : 'https://api.nowpayments.io/v1';

export function isNowPaymentsConfigured(): boolean {
  return Boolean(API_KEY && IPN_SECRET);
}

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function npRequest<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method,
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { message?: string }).message || res.statusText;
    throw new Error(`NOWPayments API error: ${msg}`);
  }
  return data as T;
}

/** Recursively sort object keys for IPN signature verification */
function sortObject(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortObject);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = sortObject((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function verifyNowPaymentsIpnSignature(body: Record<string, unknown>, signatureHeader: string | undefined): boolean {
  if (!IPN_SECRET) return false;
  if (!signatureHeader) return false;
  const sorted = JSON.stringify(sortObject(body));
  const hmac = crypto.createHmac('sha512', IPN_SECRET).update(sorted).digest('hex');
  return hmac === signatureHeader;
}

export function subscriptionOrderId(userId: string, planId: string): string {
  return `sub|${userId}|${planId}`;
}

export function parseSubscriptionOrderId(orderId: string): { userId: string; planId: string } | null {
  if (!orderId.startsWith('sub|')) return null;
  const parts = orderId.split('|');
  if (parts.length !== 3) return null;
  return { userId: parts[1], planId: parts[2] };
}

interface InvoiceResponse {
  id: string;
  invoice_url: string;
  order_id?: string;
}

async function createInvoice(params: {
  priceAmountUsd: number;
  orderId: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutResult> {
  const backendUrl = process.env.BACKEND_URL || process.env.API_URL || 'http://localhost:3001';
  const ipnUrl = `${backendUrl.replace(/\/$/, '')}/payment/webhook`;

  const invoice = await npRequest<InvoiceResponse>('POST', '/invoice', {
    price_amount: params.priceAmountUsd,
    price_currency: 'usd',
    order_id: params.orderId,
    order_description: params.description,
    ipn_callback_url: ipnUrl,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    is_fixed_rate: true,
    is_fee_paid_by_user: false,
  });

  if (!invoice.invoice_url) {
    throw new Error('NOWPayments did not return an invoice URL');
  }

  return {
    checkoutUrl: invoice.invoice_url,
    providerTransactionId: String(invoice.id),
  };
}

export const nowPaymentsProvider: PaymentProvider = {
  name: 'nowpayments',

  isConfigured(): boolean {
    return isNowPaymentsConfigured();
  },

  async createTokenCheckout(params: CreateTokenCheckoutParams): Promise<CheckoutResult> {
    if (!isNowPaymentsConfigured()) {
      throw new Error(
        'NOWPayments is not configured. Set NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET.'
      );
    }

    return createInvoice({
      priceAmountUsd: params.amountCents / 100,
      orderId: params.purchaseId,
      description: `${params.packageName} — ${params.tokens.toLocaleString()} tokens`,
      successUrl: `${FRONTEND_URL}/purchase-tokens?success=1&purchase_id=${params.purchaseId}`,
      cancelUrl: `${FRONTEND_URL}/purchase-tokens?cancelled=1`,
    });
  },

  async createSubscriptionCheckout(params: CreateSubscriptionCheckoutParams): Promise<CheckoutResult> {
    if (!isNowPaymentsConfigured()) {
      throw new Error('NOWPayments is not configured.');
    }

    const orderId = subscriptionOrderId(params.userId, params.planId);

    return createInvoice({
      priceAmountUsd: params.amountCents / 100,
      orderId,
      description: `${params.planName} — ${params.tokens.toLocaleString()} tokens/month`,
      successUrl: `${FRONTEND_URL}/purchase-tokens?subscription=success&plan_id=${params.planId}`,
      cancelUrl: `${FRONTEND_URL}/purchase-tokens?subscription=cancelled`,
    });
  },
};

/** List payments for an order_id (purchase UUID or sub|user|plan) */
export async function getPaymentsByOrderId(
  orderId: string
): Promise<Array<{ payment_status: string; payment_id?: string }>> {
  const data = await npRequest<{ data?: Array<{ payment_status: string; payment_id?: string }> }>(
    'GET',
    `/payment/?order_id=${encodeURIComponent(orderId)}`
  );
  return data.data || [];
}
