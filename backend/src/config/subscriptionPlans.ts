export const SUBSCRIPTION_PLANS = [
  {
    id: 'basic',
    name: 'Basic Monthly',
    tokens: 2000,
    price_cents: 1999,
    description: '2000 tokens/month + 50% off chat costs',
  },
  {
    id: 'premium',
    name: 'Premium Monthly',
    tokens: 5000,
    price_cents: 3999,
    description: '5000 tokens/month + 50% off chat costs',
  },
] as const;

export type SubscriptionPlanId = (typeof SUBSCRIPTION_PLANS)[number]['id'];

export function getSubscriptionPlan(planId: string) {
  return SUBSCRIPTION_PLANS.find((p) => p.id === planId);
}
