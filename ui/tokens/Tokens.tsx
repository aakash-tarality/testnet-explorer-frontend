import { Box } from '@chakra-ui/react';
import React from 'react';

import type { TokenInfo } from 'types/api/token';
import type { TokensSortingValue } from 'types/api/tokens';
import type { AggregatedTokenInfo } from 'types/client/multichain-aggregator';

import { apos } from 'toolkit/utils/htmlEntities';
import { applyTokenInfoPrice, useTokenPriceMap } from 'ui/address/utils/useTokenPrices';
import DataFetchAlert from 'ui/shared/DataFetchAlert';
import DataListDisplay from 'ui/shared/DataListDisplay';
import type { QueryWithPagesResult } from 'ui/shared/pagination/useQueryWithPages';

import TokensListItem from './TokensListItem';
import TokensTable from './TokensTable';

interface Props {
  query: QueryWithPagesResult<'general:tokens'> | QueryWithPagesResult<'general:tokens_bridged'> | QueryWithPagesResult<'multichainAggregator:tokens'>;
  onSortChange?: (value: TokensSortingValue) => void;
  sort?: TokensSortingValue;
  actionBar?: React.ReactNode;
  hasActiveFilters: boolean;
  description?: React.ReactNode;
  tableTop?: number;
}

const Tokens = ({ query, onSortChange, sort, actionBar, description, hasActiveFilters, tableTop }: Props) => {

  const { isError, isPlaceholderData, data, pagination } = query;

  // Price / on-chain market cap from Binance for the TOKENS / TOKEN_ADDRESS tokens (Blockscout has none here).
  const priceMap = useTokenPriceMap();
  const items = React.useMemo(
    () => (data?.items as Array<TokenInfo | AggregatedTokenInfo> | undefined)
      ?.map((item) => applyTokenInfoPrice(item, priceMap)) as Array<TokenInfo> | Array<AggregatedTokenInfo> | undefined,
    [ data?.items, priceMap ],
  );

  if (isError) {
    return <DataFetchAlert/>;
  }

  const content = items ? (
    <>
      <Box hideFrom="lg">
        { description }
        { items.map((item, index) => {
          const chainIds = 'chain_infos' in item ? Object.keys(item.chain_infos).join(',') : undefined;

          return (
            <TokensListItem
              key={ item.address_hash + (isPlaceholderData ? index : '') + (chainIds ? chainIds : '') }
              token={ item }
              index={ index }
              page={ pagination.page }
              isLoading={ isPlaceholderData }
            />
          );
        }) }
      </Box>
      <Box hideBelow="lg">
        { description }
        <TokensTable
          items={ items }
          page={ pagination.page }
          isLoading={ isPlaceholderData }
          setSorting={ onSortChange }
          sorting={ sort }
          top={ tableTop }
        />
      </Box>
    </>
  ) : null;

  return (
    <DataListDisplay
      isError={ isError }
      itemsNum={ data?.items.length }
      emptyText="There are no tokens."
      filterProps={{
        emptyFilteredText: `Couldn${ apos }t find token that matches your filter query.`,
        hasActiveFilters,
      }}
      actionBar={ query.pagination.isVisible || hasActiveFilters ? actionBar : null }
    >
      { content }
    </DataListDisplay>
  );
};

export default Tokens;
