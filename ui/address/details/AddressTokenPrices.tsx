import { Text } from '@chakra-ui/react';
import BigNumber from 'bignumber.js';
import React from 'react';

import type { Address } from 'types/api/address';
import type { TokenPricesResponse } from 'types/client/tokenPrices';

import config from 'configs/app';
import useApiQuery from 'lib/api/useApiQuery';
import getCurrencyValue from 'lib/getCurrencyValue';
import { Skeleton } from 'toolkit/chakra/skeleton';
import * as DetailedInfo from 'ui/shared/DetailedInfo/DetailedInfo';

interface Props {
  addressData?: Address;
  prices: TokenPricesResponse;
  isLoading?: boolean;
}

// Net worth of the tokens configured in TOKENS / TOKEN_ADDRESS, priced from Binance via
// /node-api/token-prices. Rendered by AddressDetails only when at least one is configured.
// Per-token prices and values are shown by the Tokens dropdown (see applyTokenPrice in useTokenPrices).
const AddressTokenPrices = ({ addressData, prices, isLoading }: Props) => {
  // Same query (same key and options) as the Tokens dropdown's useFetchTokens, so the two share one
  // request and its cache. The dropdown keeps it subscribed, so this component remounting can't
  // abort it mid-flight (a separate token-balances query did, raising AbortErrors under StrictMode).
  const balancesQuery = useApiQuery('general:address_tokens', {
    pathParams: { hash: addressData?.hash },
    queryParams: { type: 'ERC-20' },
    queryOptions: { enabled: Boolean(addressData?.hash) && !isLoading && Boolean(addressData?.has_tokens), refetchOnMount: false },
  });

  const tokenValues = React.useMemo(() => prices.tokens.map((item) => {
    if (!item.price) {
      return null;
    }
    const balance = balancesQuery.data?.items.find((b) => b.token.address_hash.toLowerCase() === item.address);
    if (!balance) {
      return BigNumber(0);
    }
    const decimals = Number(balance.token.decimals ?? 18);
    return BigNumber(balance.value).div(BigNumber(10).pow(decimals)).times(item.price);
  }), [ prices.tokens, balancesQuery.data ]);

  // Native coin only counts when Blockscout itself knows its exchange rate.
  const { usdBn: nativeUsd } = getCurrencyValue({
    value: addressData?.coin_balance || '0',
    exchangeRate: addressData?.exchange_rate,
    decimals: String(config.chain.currency.decimals),
  });

  const hasAnyPrice = tokenValues.some((usd) => usd !== null) || Boolean(addressData?.exchange_rate);
  const total = tokenValues.reduce<BigNumber>((sum, usd) => (usd ? sum.plus(usd) : sum), nativeUsd);

  const isBalancesLoading = isLoading || (Boolean(addressData?.has_tokens) && balancesQuery.isPending);
  const symbols = prices.tokens.map((item) => item.symbol).join(', ');

  return (
    <>
      <DetailedInfo.ItemLabel
        hint={ `Total USD value of ${ symbols }${ addressData?.exchange_rate ? ` and ${ config.chain.currency.symbol }` : '' } at Binance prices` }
        isLoading={ isLoading }
      >
        Net worth
      </DetailedInfo.ItemLabel>
      <DetailedInfo.ItemValue>
        <Skeleton loading={ isBalancesLoading }>
          <Text>{ (balancesQuery.isError || !hasAnyPrice) ? 'N/A' : `$${ total.toFormat(2) }` }</Text>
        </Skeleton>
      </DetailedInfo.ItemValue>
    </>
  );
};

export default React.memo(AddressTokenPrices);
