import type { NextApiRequest, NextApiResponse } from 'next';

import type { TokenPricesResponse } from 'types/client/tokenPrices';

import { httpLogger } from 'nextjs/utils/logger';

// Price lookup for the address page's Net worth / Token values rows.
// Tokens come from server-only env vars (read at runtime, so no rebuild is needed to change them):
//   TOKENS=ETH,BNB                       symbols, priced as <SYMBOL><BINANCE_QUOTE_ASSET> on Binance
//   TOKEN_ADDRESS=0xabc...,0xdef...      on-chain contract of each symbol, same order as TOKENS
//   BINANCE_API_URL (optional)           defaults to https://api.binance.com
//   BINANCE_QUOTE_ASSET (optional)       defaults to USDT
// Binance is called at most once per CACHE_TTL_MS no matter how many people open address pages.

interface ConfiguredToken {
  symbol: string;
  address: string;
}

interface Cache {
  payload: TokenPricesResponse;
  fetchedAt: number;
  inflight?: Promise<TokenPricesResponse>;
}

const CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

// globalThis, not a module variable: Next can load API routes as separate module copies.
const globalStore = globalThis as typeof globalThis & { __tokenPricesCache?: Cache };

function splitList(value: string | undefined) {
  return (value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function getConfig() {
  const symbols = splitList(process.env.TOKENS).map((symbol) => symbol.toUpperCase());
  const addresses = splitList(process.env.TOKEN_ADDRESS).map((address) => address.toLowerCase());
  const quote = (process.env.BINANCE_QUOTE_ASSET || 'USDT').trim().toUpperCase();
  const baseUrl = (process.env.BINANCE_API_URL || 'https://api.binance.com').trim().replace(/\/+$/, '');

  if (symbols.length !== addresses.length) {
    httpLogger.logger.error({
      message: `token-prices: TOKENS has ${ symbols.length } entries but TOKEN_ADDRESS has ${ addresses.length }; they must match one-to-one`,
    });
  }

  const tokens: Array<ConfiguredToken> = symbols
    .slice(0, Math.min(symbols.length, addresses.length))
    .map((symbol, index) => ({ symbol, address: addresses[index] }));

  return { tokens, quote, baseUrl };
}

async function fetchJson(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const data: unknown = await response.json().catch(() => null);
  return { status: response.status, data };
}

function isTicker(item: unknown): item is { symbol: string; price: string } {
  return typeof item === 'object' && item !== null &&
    typeof (item as { symbol?: unknown }).symbol === 'string' &&
    typeof (item as { price?: unknown }).price === 'string';
}

async function fetchBinancePrices(pairs: Array<string>, baseUrl: string): Promise<Map<string, string>> {
  const prices = new Map<string, string>();
  if (pairs.length === 0) {
    return prices;
  }

  // One batched call (weight 4). Binance rejects the whole batch with HTTP 400 if any symbol is
  // unknown, so on 400 retry per symbol (weight 2 each) to still price the valid ones.
  const batchUrl = `${ baseUrl }/api/v3/ticker/price?symbols=${ encodeURIComponent(JSON.stringify(pairs)) }`;
  const batch = await fetchJson(batchUrl);

  if (batch.status === 200 && Array.isArray(batch.data)) {
    batch.data.filter(isTicker).forEach((ticker) => prices.set(ticker.symbol, ticker.price));
    return prices;
  }

  if (batch.status !== 400) {
    throw new Error(`Binance ticker/price HTTP ${ batch.status }`);
  }

  await Promise.all(pairs.map(async(pair) => {
    try {
      const single = await fetchJson(`${ baseUrl }/api/v3/ticker/price?symbol=${ encodeURIComponent(pair) }`);
      if (single.status === 200 && isTicker(single.data)) {
        prices.set(single.data.symbol, single.data.price);
      } else {
        httpLogger.logger.error({ message: `token-prices: Binance has no price for ${ pair } (HTTP ${ single.status })` });
      }
    } catch (error) {
      httpLogger.logger.error({ message: `token-prices: Binance request for ${ pair } failed`, error });
    }
  }));

  return prices;
}

async function loadPrices(): Promise<TokenPricesResponse> {
  const { tokens, quote, baseUrl } = getConfig();

  // The quote asset itself (e.g. USDT in TOKENS) has no <X><X> pair on Binance; it is worth 1.
  const pairs = tokens.filter(({ symbol }) => symbol !== quote).map(({ symbol }) => symbol + quote);
  const prices = await fetchBinancePrices(pairs, baseUrl);

  return {
    updatedAt: Date.now(),
    quote,
    tokens: tokens.map(({ symbol, address }) => ({
      symbol,
      address,
      price: symbol === quote ? '1' : prices.get(symbol + quote) ?? null,
    })),
  };
}

async function getPrices(): Promise<TokenPricesResponse> {
  const cache = globalStore.__tokenPricesCache;
  const now = Date.now();

  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.payload;
  }

  // Concurrent requests after expiry share one Binance call.
  if (cache?.inflight) {
    return cache.inflight;
  }

  const inflight = loadPrices()
    .then((payload) => {
      globalStore.__tokenPricesCache = { payload, fetchedAt: Date.now() };
      return payload;
    })
    .catch((error) => {
      httpLogger.logger.error({ message: 'token-prices: Binance fetch failed', error });
      if (cache) {
        // Keep serving the last good prices (updatedAt shows their age); retry after another TTL.
        globalStore.__tokenPricesCache = { payload: cache.payload, fetchedAt: Date.now() };
        return cache.payload;
      }
      // Nothing to fall back on: drop the placeholder so the next request tries Binance again
      // instead of being handed this same rejected promise forever.
      delete globalStore.__tokenPricesCache;
      throw error;
    });

  globalStore.__tokenPricesCache = cache ?
    { ...cache, inflight } :
    { payload: { updatedAt: null, quote: '', tokens: [] }, fetchedAt: 0, inflight };

  return inflight;
}

export default async function tokenPricesHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  try {
    const payload = await getPrices();
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.status(200).json(payload);
  } catch {
    res.status(502).json({ message: 'Token prices are unavailable right now' });
  }
}
