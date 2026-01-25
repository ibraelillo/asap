import { KucoinService, Position } from '@repo/kucoin'



export const createTakeProfit = (service: KucoinService) => async (pos: Position, state: BotState) =>  {

    return await service.orders.addOrder({
        type: 'limit',
        symbol: pos.symbol,
        positionSide: pos.positionSide,
        leverage: pos.leverage,

    })
}



export const createSecurityOrder = (service: KucoinService) => async (pos: Position, state: BotState) =>  {

    return await service.orders.addOrder({
        type: 'limit',
        symbol: pos.symbol,
        positionSide: pos.positionSide,
        leverage: pos.leverage,

    })
}




export const createInitialOrder = (service: KucoinService) => async (state: BotState) =>  {

    return await service.orders.addOrder({
        type: 'market',
        symbol: state.symbol,
        positionSide: state.side,
        leverage: state.leverage,
        valueQty: "100",
        side: state.side === 'LONG' ? 'buy' : 'sell'
    })
}