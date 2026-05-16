/**
 * Polymarket + Crypto Market Data Scraper
 * Fetches live data from Polymarket (prediction markets) and CoinGecko (crypto prices)
 * No proxy needed for these public APIs.
 */

export interface PolymarketMarket {
  id: string;
  question: string;
  description: string;
  volume: number;
  liquidity: number;
  outcomePrices: string;
  outcome: string;
  startDate: string;
  endDate: string;
  volume24hr: number;
  spread: number;
  openInterest: number;
}

export interface CryptoCoin {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_24h: number;
  high_24h: number;
  low_24h: number;
  circulating_supply: number;
}

export interface MarketDataResult {
  polymarket: {
    count: number;
    markets: PolymarketMarket[];
    timestamp: string;
  };
  crypto: {
    count: number;
    coins: CryptoCoin[];
    timestamp: string;
  };
  generated_at: string;
}

/**
 * Fetch top Polymarket markets by volume
 */
export async function fetchPolymarketMarkets(limit: number = 50): Promise<PolymarketMarket[]> {
  const url = `https://gamma-api.polymarket.com/markets?limit=${limit}&closed=false&tag=all&volume=true`;
  
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Polymarket API error: ${response.status}`);
  }

  const data = await response.json();
  
  return data.map((m: any) => ({
    id: m.id || '',
    question: m.question || '',
    description: m.description || '',
    volume: parseFloat(m.volume || '0'),
    liquidity: parseFloat(m.liquidity || '0'),
    outcomePrices: m.outcomePrices || '',
    outcome: m.outcome || '',
    startDate: m.startDate || '',
    endDate: m.endDate || '',
    volume24hr: parseFloat(m.volume24hr || '0'),
    spread: parseFloat(m.spread || '0'),
    openInterest: parseFloat(m.openInterest || '0'),
  }));
}

/**
 * Fetch top crypto prices from CoinGecko
 */
export async function fetchCryptoPrices(limit: number = 50): Promise<CryptoCoin[]> {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=${limit}&page=1&sparkline=false`;
  
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`CoinGecko API error: ${response.status}`);
  }

  return await response.json();
}

/**
 * Fetch all market data
 */
export async function fetchAllMarketData(): Promise<MarketDataResult> {
  const [markets, coins] = await Promise.all([
    fetchPolymarketMarkets(50),
    fetchCryptoPrices(50),
  ]);

  return {
    polymarket: {
      count: markets.length,
      markets,
      timestamp: new Date().toISOString(),
    },
    crypto: {
      count: coins.length,
      coins,
      timestamp: new Date().toISOString(),
    },
    generated_at: new Date().toISOString(),
  };
}
