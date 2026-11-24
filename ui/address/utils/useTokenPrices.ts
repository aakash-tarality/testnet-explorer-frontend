import { useQuery } from '@tanstack/react-query';
import React from 'react';

import type { AddressTokenBalance } from 'types/api/address';
import type { TokenPricesResponse } from 'types/client/tokenPrices';

const REFRESH_MS = 60_000;

// Binance prices for the tokens in the TOKENS / TOKEN_ADDRESS env vars, served by this app's own
// pages/api/token-prices.ts (same origin, same port). An empty `tokens` list means none are configured.
export default function useTokenPrices() {
  return useQuery<TokenPricesResponse>({
    queryKey: [ 'node-api:token-prices' ],
    queryFn: async() => {
      const response = await fetch('/node-api/token-prices');
      if (!response.ok) {
        throw new Error(`token-prices HTTP ${ response.status }`);
      }
      return response.json() as Promise<TokenPricesResponse>;
    },
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
    retry: 1,
  });
}

// lowercased contract address -> Binance price, for the configured tokens that have one.
export function useTokenPriceMap() {
  const { data } = useTokenPrices();
  return React.useMemo(() => {
    const map = new Map<string, string>();
    data?.tokens.forEach(({ address, price }) => {
      if (price) {
        map.set(address, price);
      }
    });
    return map;
  }, [ data ]);
}

// Blockscout shows a token's USD value only from token.exchange_rate, which this chain leaves empty.
// Filling it from Binance makes every existing view (Tokens dropdown and its total, Tokens tab) price
// the configured tokens. A rate Blockscout already has is kept. Returns a copy; cached data is untouched.
export function applyTokenPrice<T extends AddressTokenBalance>(item: T, priceMap: Map<string, string>): T {
  if (item.token.exchange_rate || item.token.type !== 'ERC-20') {
    return item;
  }
  const price = priceMap.get(item.token.address_hash.toLowerCase());
  return price ? { ...item, token: { ...item.token, exchange_rate: price } } : item;
}
