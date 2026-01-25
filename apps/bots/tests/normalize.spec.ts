import { describe, it, expect } from 'vitest'
import {normalizePrice, getTickSizeOf, takeProfitPrice, securityOrder} from "../prices";

describe('Prices', () =>  {


    it('Can get the pricemultiplier from a price', () =>  {
        const pow = getTickSizeOf(0.8123)
        expect(pow).toEqual(0.0001)
    })

    it('Can get the pricemultiplier from a price', () =>  {
        const pow = getTickSizeOf(670.245)
        expect(pow).toEqual(0.001)
    })


    it('Can get take profit price', () =>  {
        const pow = takeProfitPrice(670.245, 'LONG', 1)
        expect(pow).toEqual(676.947)
    })

    it('Can get take profit price', () =>  {
        const pow = takeProfitPrice(670.245, 'SHORT', 1)
        expect(pow).toEqual(663.543)
    })

    it('Can get take security order', () =>  {
        const pow = securityOrder(670.245, 'SHORT', 1)
        expect(pow).toEqual(676.947)
    })

    it('Can get take security order', () =>  {
        const pow = securityOrder(670.245, 'LONG', 1)
        expect(pow).toEqual(663.543)
    })


    it('Can get take security order', () =>  {
        const pow = securityOrder(0.00004567, 'LONG', 0.55)
        expect(pow).toEqual(0.00004542)
    })

    it('Can get take security order', () =>  {
        const pow = securityOrder(0.000006333, 'LONG', 0.55)
        expect(pow).toEqual(0.000006298)
    })



    it('Must not apply normalization if already normalized:  0.1', () =>  {

        const normalized = normalizePrice(670.2, 0.1)
        expect(normalized).toEqual(670.2)
    })

    it('Must not apply normalization if already normalized:  0', () =>  {

        const normalized = normalizePrice(670.2, 0)
        expect(normalized).toEqual(670)
    })

    it('Must be able to normalize price with tickSize 0.1', () =>  {

        const normalized = normalizePrice(670.2453, 0.1)
        expect(normalized).toEqual(670.2)
    })

    it('Must be able to normalize price with tickSize 0.01', () =>  {

        const normalized = normalizePrice(670.2453, 0.01)
        expect(normalized).toEqual(670.25)
    })

    it('Must be able to normalize price with tickSize 0.001', () =>  {

        const normalized = normalizePrice(670.2453, 0.001)
        expect(normalized).toEqual(670.245)
    })

    it('Must be able to normalize price with tickSize 52000', () =>  {

        const normalized = normalizePrice(0.0000063331, 52000)
        expect(normalized).toEqual(0.000006333)
    })

    it('Must be able to normalize price with tickSize 52000', () =>  {

        const normalized = normalizePrice(0.0000057451, 52000)
        expect(normalized).toEqual(0.000005745)
    })

    it('Must be able to normalize price with tickSize 100', () =>  {

        const normalized = normalizePrice(0.82143, 100)
        expect(normalized).toEqual(0.8214)
    })
})