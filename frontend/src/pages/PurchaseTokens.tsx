import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import AppLayout from '../layouts/AppLayout';
import VIPBadge from '../components/VIPBadge';
import './PurchaseTokens.css';

interface TokenPackage {
  id: string;
  name: string;
  tokens: number;
  price_cents: number;
  original_price_cents?: number | null;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  tokens: number;
  price_cents: number;
  description: string;
}

interface Subscription {
  id: string;
  status: string;
  isActive: boolean;
  current_period_end: string;
  monthly_tokens: number;
  cancel_at_period_end: boolean;
}

async function pollPurchaseStatus(purchaseId: string, maxAttempts = 12): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await apiClient.get(`/tokens/purchase/${purchaseId}/status`);
      if (response.data.status === 'completed') {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    } catch {
      // continue polling
    }
  }
  return false;
}

export default function PurchaseTokens() {
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [affiliateCode, setAffiliateCode] = useState<string>('');
  const [affiliateCodeStatus, setAffiliateCodeStatus] = useState<string | null>(null);
  const { isAuthenticated, user, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Wait a tick to allow auth context to load from localStorage
    const checkAuth = setTimeout(() => {
      if (!isAuthenticated) {
        navigate('/login');
        return;
      }
      // Load any previously saved affiliate code
      const savedAffiliateCode = localStorage.getItem('affiliate_code');
      if (savedAffiliateCode) {
        setAffiliateCode(savedAffiliateCode);
        setAffiliateCodeStatus('Affiliate code applied and saved.');
      }

      fetchPackages();
      fetchSubscriptionPlans();
      fetchSubscriptionStatus();
    }, 200);
    
    return () => clearTimeout(checkAuth);
  }, [isAuthenticated]);
  const handleApplyAffiliateCode = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    const trimmed = affiliateCode.trim();
    if (!trimmed) {
      setAffiliateCodeStatus('Please enter a valid affiliate code.');
      return;
    }

    // Store once so it is reused automatically on future visits
    localStorage.setItem('affiliate_code', trimmed.toUpperCase());
    setAffiliateCode(trimmed.toUpperCase());
    setAffiliateCodeStatus('Affiliate code saved. It will be used for all future purchases.');
  };


  const fetchPackages = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/tokens/packages');
      setPackages(response.data.packages || []);
      setIsMember(response.data.isMember || false);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching packages:', err);
      setError(err.response?.data?.error || 'Failed to load token packages');
    } finally {
      setLoading(false);
    }
  };

  const fetchSubscriptionPlans = async () => {
    try {
      const response = await apiClient.get('/tokens/subscriptions/plans');
      setSubscriptionPlans(response.data.plans || []);
    } catch (err: any) {
      console.error('Error fetching subscription plans:', err);
    }
  };

  const fetchSubscriptionStatus = async () => {
    try {
      setSubscriptionLoading(true);
      const response = await apiClient.get('/tokens/subscriptions/status');
      setSubscription(response.data.subscription || null);
    } catch (err: any) {
      console.error('Error fetching subscription status:', err);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleSubscription = async (planId: string) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    setPurchasing(planId);
    setError(null);

    try {
      const response = await apiClient.post('/tokens/subscriptions/create', {
        plan_id: planId,
      });

      // Redirect to hosted crypto checkout
      if (response.data.url) {
        window.location.href = response.data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      console.error('Subscription error:', err);
      setError(err.response?.data?.error || 'Failed to create subscription');
      setPurchasing(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will continue to have access until the end of your billing period.')) {
      return;
    }

    try {
      await apiClient.post('/tokens/subscriptions/cancel');
      alert('Your subscription has been scheduled for cancellation at the end of the billing period.');
      fetchSubscriptionStatus();
    } catch (err: any) {
      console.error('Cancel subscription error:', err);
      setError(err.response?.data?.error || 'Failed to cancel subscription');
    }
  };

  const refreshBalance = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
    if (!token || !user?.id) return;
    const balanceResponse = await apiClient.get('/tokens/balance');
    login(token, { ...user, tokenBalance: balanceResponse.data.balance });
  }, [user, login]);

  const handlePurchase = async (packageId: string) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    setPurchasing(packageId);
    setError(null);

    try {
      const response = await apiClient.post('/tokens/purchase', {
        package_id: packageId,
        affiliate_code: affiliateCode.trim() || undefined,
      });

      if (response.data.completed) {
        await refreshBalance();
        alert(`Success! You received ${response.data.package.tokens} tokens.`);
        setPurchasing(null);
        fetchPackages();
        return;
      }

      if (response.data.checkoutUrl) {
        window.location.href = response.data.checkoutUrl;
        return;
      }

      throw new Error('No checkout URL returned');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to process purchase');
      setPurchasing(null);
    }
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const bestValuePackageId =
    packages.length > 0
      ? [...packages].sort((a, b) => b.tokens / b.price_cents - a.tokens / a.price_cents)[0]?.id
      : null;

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const purchaseId = urlParams.get('purchase_id');

    const finishTokenPurchase = async () => {
      if (purchaseId) {
        await pollPurchaseStatus(purchaseId);
      }
      await refreshBalance();
      alert('Payment successful! Your tokens have been added to your account.');
      window.history.replaceState({}, '', '/purchase-tokens');
      fetchPackages();
    };

    if (urlParams.get('success') === '1' || urlParams.get('success') === 'true') {
      finishTokenPurchase();
    }

    if (urlParams.get('subscription') === 'success') {
      const planId = urlParams.get('plan_id') || undefined;
      const syncSubscription = async () => {
        try {
          const response = await apiClient.post('/tokens/subscriptions/sync', { planId });
          if (response.data.success) {
            alert(response.data.message || 'VIP membership activated!');
          } else {
            alert(
              response.data.message ||
                'Payment received. Your VIP status will activate shortly once payment is confirmed.'
            );
          }
        } catch (err: any) {
          alert(
            err.response?.data?.error ||
              'Payment received. VIP activation may take a minute — refresh if tokens are not added.'
          );
        }
        fetchSubscriptionStatus();
        await refreshBalance();
        window.history.replaceState({}, '', '/purchase-tokens');
      };
      syncSubscription();
    }

    if (urlParams.get('cancelled') === '1' || urlParams.get('subscription') === 'cancelled') {
      setError('Payment was cancelled.');
      window.history.replaceState({}, '', '/purchase-tokens');
    }
  }, []);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <AppLayout className="purchase-tokens-page">
      
      <div className="tokens-container">
        <div className="tokens-hero">
          <div className="balance-card">
            <img src="/coin.png" alt="Token" className="balance-icon balance-coin-icon" onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              if (!target.nextElementSibling) {
                const fallback = document.createElement('span');
                fallback.className = 'balance-icon-fallback';
                fallback.textContent = '💰';
                target.parentElement?.insertBefore(fallback, target);
              }
            }} />
            <div className="balance-info">
              <span className="balance-label">Current Balance</span>
              <span className="balance-amount">{(user?.tokenBalance || 0).toLocaleString()}</span>
              <span className="balance-unit">tokens</span>
            </div>
          </div>
          {subscription && subscription.isActive && (
            <div className="vip-status-card">
              <div className="vip-icon">
                <VIPBadge isVIP={true} size="medium" />
              </div>
              <div className="vip-info">
                <span className="vip-title">VIP Member</span>
                <span className="vip-details">
                  {subscription.monthly_tokens.toLocaleString()} tokens/month • 50% off chat costs
                </span>
              {subscription.cancel_at_period_end && (
                  <span className="vip-cancel-notice">
                    Cancels: {new Date(subscription.current_period_end).toLocaleDateString()}
                </span>
              )}
              </div>
            </div>
          )}
        </div>

        {error && <div className="error-banner">{error}</div>}

        {/* Token Usage Comparison Section */}
        <div className="comparison-section">
          <h2 className="section-title">Chat Costs</h2>
          <div className="comparison-cards">
            <div className="comparison-card-modern">
              <div className="comparison-header">
                <h3>Standard</h3>
                <span className="comparison-badge-modern">Regular</span>
              </div>
              <div className="comparison-price">
                <span className="price-amount">100</span>
                <span className="price-label">tokens per message</span>
                </div>
              <div className="comparison-example-modern">
                <p>20 messages = 2,000 tokens</p>
              </div>
            </div>
            <div className="comparison-card-modern comparison-card-vip">
              <div className="vip-badge-top">BEST VALUE</div>
              <div className="comparison-header">
                <h3 className="vip-header-title">VIP</h3>
                <span className="comparison-badge-modern vip-badge">50% OFF</span>
              </div>
              <div className="comparison-price">
                <span className="price-amount vip-price">50</span>
                <span className="price-label">tokens per message</span>
                </div>
              <div className="comparison-example-modern">
                <p className="vip-example">20 messages = 1,000 tokens</p>
                <p className="savings-badge">Save 1,000 tokens!</p>
              </div>
            </div>
          </div>
        </div>

        {/* Subscription Plans Section */}
        {subscriptionPlans.length > 0 && (
          <div className="subscription-section">
            <h2 className="section-title">Monthly Subscriptions</h2>
            <p className="section-description">
              Get monthly tokens + 50% off chat costs
            </p>
            {subscription && subscription.isActive ? (
              <div className="active-subscription-card">
                <div className="subscription-header">
                  <div className="subscription-icon">✨</div>
                  <div>
                  <h3>Your VIP Membership</h3>
                    <p className="subscription-status">Active</p>
                  </div>
                </div>
                <div className="subscription-tokens">
                  <span className="subscription-amount">{subscription.monthly_tokens.toLocaleString()}</span>
                  <span className="subscription-label">tokens per month</span>
                </div>
                <div className="subscription-details">
                  <p>Next billing: {new Date(subscription.current_period_end).toLocaleDateString()}</p>
                </div>
                <button
                  className="btn-cancel-subscription"
                  onClick={handleCancelSubscription}
                >
                  Cancel Membership
                </button>
              </div>
            ) : (
              <div className="subscription-grid">
                {subscriptionPlans.map((plan) => (
                  <div key={plan.id} className="subscription-card">
                    <div className="subscription-card-header">
                      <h3>{plan.name}</h3>
                      <div className="subscription-price">{formatPrice(plan.price_cents)}<span className="price-period">/mo</span></div>
                    </div>
                    <div className="subscription-tokens">
                      <span className="subscription-amount">{plan.tokens.toLocaleString()}</span>
                      <span className="subscription-label">tokens/month</span>
                    </div>
                    <p className="subscription-description">{plan.description}</p>
                    <button
                      className="btn-subscribe"
                      onClick={() => handleSubscription(plan.id)}
                      disabled={purchasing === plan.id}
                    >
                      {purchasing === plan.id ? 'Processing...' : 'Subscribe Now'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Affiliate Code Input Section */}
        <div className="affiliate-code-section">
          <div className="affiliate-code-card">
            <div className="affiliate-code-header">
              <h3>Have an Affiliate Code?</h3>
              <p className="affiliate-code-description">
                Enter a code once to support your favorite affiliate. It will be saved and
                automatically applied to all future purchases on this device.
              </p>
            </div>
            <form
              className="affiliate-code-input-wrapper"
              onSubmit={handleApplyAffiliateCode}
            >
              <input
                type="text"
                className="affiliate-code-input"
                placeholder="Enter affiliate code (e.g., AFF-XXXX)"
                value={affiliateCode}
                onChange={(e) => {
                  setAffiliateCode(e.target.value.toUpperCase());
                  setAffiliateCodeStatus(null);
                }}
                maxLength={20}
              />
              {affiliateCode && (
                <button
                  type="button"
                  className="affiliate-code-clear"
                  onClick={() => {
                    setAffiliateCode('');
                    setAffiliateCodeStatus(null);
                    localStorage.removeItem('affiliate_code');
                  }}
                  title="Clear code"
                >
                  ×
                </button>
              )}
              <button
                type="submit"
                className="affiliate-code-apply"
              >
                Apply
              </button>
            </form>
            {affiliateCodeStatus && (
              <p className="affiliate-code-status">
                {affiliateCodeStatus}
              </p>
            )}
            {user?.referredByAffiliateId && (
              <p className="affiliate-code-note">
                ✨ You were referred! You'll get 10% off your first purchase.
              </p>
            )}
          </div>
        </div>

        {/* One-Time Token Packages Section */}
        <div className="packages-section">
          <div className="section-header">
            <h2 className="section-title">One-Time Packages</h2>
            {isMember && (
              <div className="member-badge">
                ✨ Member: 25% OFF
              </div>
            )}
          </div>
          {loading ? (
            <div className="loading-state">Loading packages...</div>
          ) : (
            <div className="packages-grid-modern">
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className={`package-card-modern ${pkg.id === bestValuePackageId ? 'package-best-value' : ''} ${isMember && pkg.original_price_cents ? 'member-discount' : ''}`}
                >
                  {pkg.id === bestValuePackageId && (
                    <div className="best-value-badge">Best value</div>
                  )}
                  {isMember && pkg.original_price_cents && (
                    <div className="discount-badge">25% OFF</div>
                  )}
                  <div className="package-card-top">
                    <h3 className="package-name">{pkg.name}</h3>
                    <div className="package-pricing">
                      {pkg.original_price_cents && pkg.original_price_cents > pkg.price_cents ? (
                        <>
                          <span className="price-original">{formatPrice(pkg.original_price_cents)}</span>
                          <span className="price-current">{formatPrice(pkg.price_cents)}</span>
                        </>
                      ) : (
                        <span className="price-current">{formatPrice(pkg.price_cents)}</span>
                      )}
                    </div>
                  </div>
                  <div className="package-tokens-modern">
                    <span className="tokens-number">{pkg.tokens.toLocaleString()}</span>
                    <span className="tokens-text">tokens</span>
                  </div>
                  {pkg.original_price_cents && pkg.original_price_cents > pkg.price_cents && (
                    <div className="member-savings">
                      Save {formatPrice(pkg.original_price_cents - pkg.price_cents)}
                    </div>
                  )}
                  <div className="package-value-modern">
                    ~{Math.round((pkg.tokens / (pkg.price_cents / 100)) * 100) / 100} tokens per dollar
                  </div>
                  <button
                    className="btn-purchase"
                    onClick={() => handlePurchase(pkg.id)}
                    disabled={purchasing === pkg.id}
                  >
                    {purchasing === pkg.id ? 'Processing...' : 'Purchase'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="purchase-trust-row">
          <span>🔒 Secure crypto checkout via NOWPayments</span>
          <span>•</span>
          <span>Tokens delivered instantly</span>
          <span>•</span>
          <span>Cancel VIP anytime</span>
        </div>
      </div>
    </AppLayout>
  );
}
