import { DISCOUNT_TYPE } from "./constants";

// Shared bundle math — used by the buyer strip and the rep builder preview.
export function bundlePricing(prices: number[], discountType: string, discountValue: number) {
  const sum = prices.reduce((a, b) => a + b, 0);
  let saveAmt: number;
  if (discountType === DISCOUNT_TYPE.PERCENT) {
    saveAmt = Math.round((sum * discountValue) / 100);
  } else {
    saveAmt = Math.min(discountValue, sum);
  }
  const bundlePrice = sum - saveAmt;
  const savePct = sum > 0 ? Math.round((saveAmt / sum) * 100) : 0;
  return { sum, saveAmt, bundlePrice, savePct };
}

// Assume a blended cost basis of ~55% of wholesale for the margin readout.
export function bundleMargin(bundlePrice: number, sumWholesale: number) {
  const cost = sumWholesale * 0.55;
  if (bundlePrice <= 0) return 0;
  return Math.round(((bundlePrice - cost) / bundlePrice) * 1000) / 10;
}
