import type {
  ExchangePositionReader,
  ExchangePositionSnapshot,
} from "@repo/trading-engine";
import type { KucoinService } from "@repo/kucoin";
import { mapPositionSnapshot } from "./position-snapshot";

export class KucoinPositionReader implements ExchangePositionReader {
  constructor(private readonly service: KucoinService) {}

  async getOpenPositions(symbol: string): Promise<ExchangePositionSnapshot[]> {
    const positions = await this.service.positions.getPosition(symbol);
    return positions
      .map((position) => mapPositionSnapshot(position))
      .filter((snapshot): snapshot is ExchangePositionSnapshot =>
        Boolean(snapshot && snapshot.isOpen),
      );
  }
}
