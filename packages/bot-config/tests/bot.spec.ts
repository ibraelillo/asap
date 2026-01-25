import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import {createBotStore} from "../src/store";
import {createKucoinClient, createKucoinService} from "@repo/kucoin";
import {BotEngine} from '../src/engine'
import { PositionClosed, PositionChanged, OrquestratorStarted } from '@repo/events'
import {Resource} from "sst";

const service = createKucoinService(
    createKucoinClient({
        apiKey: process.env.KUCOIN_API_KEY,
        apiSecret: process.env.KUCOIN_API_SECRET,
        passphrase: process.env.KUCOIN_API_PASSPHRASE,
    })
)

const engine = new BotEngine(
    Resource.Bots.name,
    service
)

describe('bot config tests', () => {

    describe('Engine', () => {

        const symbol = 'FILUSDTM'

        beforeAll(async () =>  {
            await engine.run(symbol, OrquestratorStarted.type, { positionSide: 'LONG'})
        })


        it('Can initialize a trade', async () =>  {
            await engine.run(symbol, PositionChanged.type, { positionSide: 'LONG' })
        })



        afterAll(async () => {
            await engine.run(symbol, PositionClosed.type, { positionSide: 'LONG' })
        })
    })



    describe.skip('Store', () =>  {

        it('Must get symbol information on start', async () => {
            const { store, actions } = createBotStore({ symbol: 'SUIUSDTM', side: 'LONG' }, service)

            await store.dispatch(
                actions.start('SUIUSDTM')
            )

            const state = store.getState()

            expect(state.symbol).toEqual('SUIUSDTM')
            expect(state.leverage).toEqual(75)

        })

        it('got position', async () =>  {
            const { store, actions } = createBotStore({ symbol: 'SOLUSDTM', side: 'LONG' }, service)

            await store.dispatch(
                actions.start()
            )

            store.dispatch(
                actions.positionChanged({
                    symbol: '',
                    avgEntryPrice: 123,
                    isOpen: true,
                    positionSide: 'LONG',
                    currentCost: 100,
                    currentComm: 0.1
                })
            )

            const state = store.getState()

            console.log(state)

            expect(state.avgEntryPrice).toEqual(123)
        })

        it('got position', async () =>  {
            const { store, actions } = createBotStore({ symbol: 'PEPEUSDTM', side: 'LONG' }, service)

            await store.dispatch(
                actions.start('')
            )

            store.dispatch(
                actions.positionChanged({
                    avgEntryPrice: 123,
                    isOpen: true,
                    positionSide: 'LONG',
                    currentCost: 100,
                    currentComm: 0.1
                })
            )

            const state = store.getState()

            console.log(state)

            expect(state.avgEntryPrice).toEqual(123)
        })

        it('got position', async () =>  {
            const { store, actions } = createBotStore({ symbol: 'ENAUSDTM', side: 'LONG' }, service)

            await store.dispatch(
                actions.start('')
            )

            store.dispatch(
                actions.positionChanged({
                    avgEntryPrice: 7.24,
                    isOpen: true,
                    positionSide: 'LONG',
                    currentCost: 100,
                    currentComm: 0.1
                })
            )

            const state = store.getState()

            console.log(state)

            expect(state.tpPrice).toBeDefined()
        })

        it('got position', async () =>  {
            const { store, actions } = createBotStore({ symbol: 'XRPUSDTM', side: 'SHORT' }, service)

            await store.dispatch(
                actions.start('')
            )

            store.dispatch(
                actions.positionChanged({
                    avgEntryPrice: 7.24,
                    isOpen: true,
                    positionSide: 'SHORT',
                    currentCost: 100,
                    currentComm: 0.1
                })
            )

            const state = store.getState()

            console.log(state)

            expect(state.tpPrice).toBeDefined()
        })
    })

})