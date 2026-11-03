export const NET_WORTH_TIERS = Object.freeze({
  red: { label: 'Below $100K', className: 'tier-red' },
  orange: { label: '$100K–$200K', className: 'tier-orange' },
  green: { label: '$200K and above', className: 'tier-green' },
});

export function getNetWorthTier(netWorth) {
  if (netWorth < 100_000) return 'red';
  if (netWorth < 200_000) return 'orange';
  return 'green';
}

export function formatNetWorth(netWorth) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(netWorth);
}
