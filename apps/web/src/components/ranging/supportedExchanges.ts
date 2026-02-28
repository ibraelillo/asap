export const SUPPORTED_EXCHANGES = [
  {
    id: "kucoin",
    label: "KuCoin Futures",
    description: "Perpetual futures execution via the KuCoin adapter.",
  },
] as const;

export function getSupportedExchange(exchangeId: string) {
  return SUPPORTED_EXCHANGES.find((exchange) => exchange.id === exchangeId);
}
