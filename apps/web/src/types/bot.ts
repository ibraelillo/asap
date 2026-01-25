export interface BotConfig {
  id: string;
  symbol: string;
  positionSide: "LONG" | "SHORT";
  enabled: boolean;
  baseOrderSize: number;
  takeProfitPercent: number;
  leverage: number;
  marginMode: "CROSS" | "ISOLATED";
  securityOrder: {
    distancePercentage: number;
    sizeMultiplier: number;
  };
  createdAt: number;
  updatedAt: number;
}

export interface BotConfigCreate {
  symbol: string;
  positionSide: "LONG" | "SHORT";
  enabled: boolean;
  baseOrderSize: number;
  takeProfitPercent: number;
  leverage: number;
  marginMode: "CROSS" | "ISOLATED";
  securityOrder: {
    distancePercentage: number;
    sizeMultiplier: number;
  };
}
