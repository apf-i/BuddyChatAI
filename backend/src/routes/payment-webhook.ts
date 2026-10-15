import express from 'express';
import {
  verifyNowPaymentsIpnSignature,
  parseSubscriptionOrderId,
  completeTokenPurchase,
  failTokenPurchase,
  activateOrRenewSubscription,
  resolvePlanFromId,
} from '../services/payment';
import { supabase } from '../db/supabase';

export const paymentWebhookRouter = express.Router();

const SUCCESS_STATUSES = new Set(['finished', 'confirmed']);
const FAIL_STATUSES = new Set(['failed', 'refunded', 'expired']);

paymentWebhookRouter.post('/webhook', express.json(), async (req, res) => {
  try {
    const signature = req.headers['x-nowpayments-sig'] as string | undefined;
    const body = req.body as Record<string, unknown>;

    if (!verifyNowPaymentsIpnSignature(body, signature)) {
      console.error('NOWPayments IPN signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    const paymentStatus = String(body.payment_status || body.status || '').toLowerCase();
    const orderId = String(body.order_id || '');
    const paymentId = String(body.payment_id || body.invoice_id || body.id || `np-${Date.now()}`);
    const priceAmount = parseFloat(String(body.price_amount || body.pay_amount || '0'));
    const amountCents = Math.round(priceAmount * 100);

    console.log('NOWPayments IPN:', { paymentStatus, orderId, paymentId });

    if (!orderId) {
      return res.status(200).send('OK');
    }

    const subOrder = parseSubscriptionOrderId(orderId);

    if (subOrder) {
      if (SUCCESS_STATUSES.has(paymentStatus)) {
        const plan = resolvePlanFromId(subOrder.planId);
        const tokens = plan?.tokens || 0;
        const priceCents = amountCents || plan?.price_cents || 0;
        const nextPeriodEnd = new Date();
        nextPeriodEnd.setDate(nextPeriodEnd.getDate() + 30);

        await activateOrRenewSubscription({
          userId: subOrder.userId,
          planId: subOrder.planId,
          tokens,
          priceCents,
          providerSubscriptionId: paymentId,
          providerCustomerId: body.customer_email ? String(body.customer_email) : undefined,
          status: 'active',
          currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: nextPeriodEnd.toISOString(),
          isRenewal: false,
        });
      }
      return res.status(200).send('OK');
    }

    // Token purchase — order_id is purchase UUID
    const { data: purchase } = await supabase
      .from('token_purchases')
      .select('id, user_id, tokens_purchased, amount_paid_cents, status')
      .eq('id', orderId)
      .maybeSingle();

    if (!purchase) {
      console.warn('IPN for unknown order_id:', orderId);
      return res.status(200).send('OK');
    }

    if (SUCCESS_STATUSES.has(paymentStatus)) {
      await completeTokenPurchase({
        purchaseId: purchase.id,
        userId: purchase.user_id,
        tokens: purchase.tokens_purchased,
        amountCents: purchase.amount_paid_cents || amountCents,
        providerTransactionId: paymentId,
      });
    } else if (FAIL_STATUSES.has(paymentStatus)) {
      await failTokenPurchase(purchase.id, paymentId);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('NOWPayments webhook error:', err);
    res.status(500).send('Error');
  }
});
