/**
 * Polymarket + Crypto Market Data Service
 * Serves live market data via x402 micropayments
 * Price: $0.003/request
 */

import { Hono } from 'hono';
import { extractPayment, verifyPayment, build402Response } from '../payment';
import { fetchAllMarketData, fetchPolymarketMarkets, fetchCryptoPrices } from '../scrapers/market-data-scraper';

export const marketDataRouter = new Hono();

const SERVICE_NAME = 'polymarket-crypto-data';
const PRICE_USDC = 0.003;
const DESCRIPTION = 'Live Polymarket prediction markets + top 50 crypto prices data. Real-time volume, liquidity, outcome prices, spreads, and market stats. No API key needed.';
const OUTPUT_SCHEMA = {
  input: {
    type: '"all" | "polymarket" | "crypto" (optional, default: "all") — which data to fetch',
    limit: 'number (optional, default: 50, max: 100) — number of markets or coins to return',
  },
  output: {
    polymarket: '{ count: number, markets: Market[], timestamp: string }',
    crypto: '{ count: number, coins: Coin[], timestamp: string }',
    generated_at: 'string',
    payment: '{ txHash, network, amount, settled }',
  },
};

// ─── GET /api/market-data ───────────────────────────
marketDataRouter.get('/market-data', async (c) => {
  const walletAddress = process.env.WALLET_ADDRESS;
  if (!walletAddress) {
    return c.json({ error: 'Service misconfigured: WALLET_ADDRESS not set' }, 500);
  }

  // Step 1: Check payment
  const payment = extractPayment(c);
  if (!payment) {
    return c.json(
      build402Response('/api/market-data', DESCRIPTION, PRICE_USDC, walletAddress, OUTPUT_SCHEMA),
      402,
    );
  }

  // Step 2: Verify payment on-chain
  const verification = await verifyPayment(payment, walletAddress, PRICE_USDC);
  if (!verification.valid) {
    return c.json({
      error: 'Payment verification failed',
      reason: verification.error,
      hint: 'Send the exact USDC amount to the recipient wallet on Solana or Base, then retry with Payment-Signature header.',
    }, 402);
  }

  // Step 3: Execute
  try {
    const type = c.req.query('type') || 'all';
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50') || 50, 1), 100);

    let result: any = {};

    if (type === 'polymarket') {
      const markets = await fetchPolymarketMarkets(limit);
      result = {
        polymarket: { count: markets.length, markets, timestamp: new Date().toISOString() },
      };
    } else if (type === 'crypto') {
      const coins = await fetchCryptoPrices(limit);
      result = {
        crypto: { count: coins.length, coins, timestamp: new Date().toISOString() },
      };
    } else {
      const [markets, coins] = await Promise.all([
        fetchPolymarketMarkets(limit),
        fetchCryptoPrices(limit),
      ]);
      result = {
        polymarket: { count: markets.length, markets, timestamp: new Date().toISOString() },
        crypto: { count: coins.length, coins, timestamp: new Date().toISOString() },
      };
    }

    const responsePayload = {
      type,
      limit,
      ...result,
      generated_at: new Date().toISOString(),
      payment: {
        txHash: payment.txHash,
        network: payment.network,
        amount: verification.amount,
        settled: true,
      },
    };

    // Return successfully
    return c.json(responsePayload, 200, {
      'X-Payment-Settled': 'true',
      'X-Payment-TxHash': payment.txHash,
      'Cache-Control': 'public, max-age=60',
    });
  } catch (err: any) {
    return c.json({
      error: 'Market data fetch failed',
      message: err.message || String(err),
      hint: 'The upstream API may be temporarily unavailable. Try again in a few seconds.',
    }, 502);
  }
});

// ─── GET /api/market-data/health ─────────────────────
marketDataRouter.get('/market-data/health', async (c) => {
  return c.json({
    status: 'healthy',
    service: SERVICE_NAME,
    price: `${PRICE_USDC} USDC`,
    wallet: process.env.WALLET_ADDRESS,
    version: '1.0.0',
  });
});
