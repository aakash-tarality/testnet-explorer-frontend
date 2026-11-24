// Response of /node-api/token-prices (pages/api/token-prices.ts).
export interface TokenPrice {
  symbol: string;
  // lowercased contract address from TOKEN_ADDRESS
  address: string;
  // USD (Binance quote asset) price as a decimal string; null when Binance had no price for it
  price: string | null;
}

export interface TokenPricesResponse {
  // ms timestamp of the Binance fetch these prices came from; null before the first success
  updatedAt: number | null;
  quote: string;
  tokens: Array<TokenPrice>;
}
