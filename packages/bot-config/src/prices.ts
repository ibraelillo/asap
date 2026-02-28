export function getPow(value: number): number {
  let pow = 0;
  let scaled = value;

  while (!Number.isInteger(scaled)) {
    pow++;
    scaled = value * 10 ** pow;

    if (pow >= 10) break;
  }

  return pow;
}

export function normalizePrice(price: number, tickSize: number): number {
  if (tickSize === 0) return Math.round(price);

  if (tickSize >= 1) {
    let p = price;
    let pow = getPow(p);

    const fullInteger = price * 10 ** pow;
    const rounded = Math.round(fullInteger / 10) * 10;

    return Math.floor(rounded * tickSize) / (tickSize * 10 ** pow);
  }

  let tick = tickSize;
  let pow = 0;
  while (tick < 1) {
    tick *= 10;
    pow++;
  }

  const powedPrice = price * Math.pow(10, pow);

  const normalized = Math.round(powedPrice) / Math.pow(10, pow);

  return normalized;
}

// /**
//  *
//  * @param price
//  * @param tickSize
//  */
// export const normalizePrice = (price: number, tickSize: number) =>  {
//     if(tickSize === 0) return Math.round(price)
//
//     if(tickSize > 1) {
//
//         console.log(price * tickSize)
//         return Math.round(price * tickSize) / tickSize
//     }
//
//     let tick = tickSize
//     let pow = 0
//     while (price * Math.pow(10, pow) < 1 && tick > 1) {
//         tick *= 10
//         pow++
//     }
//
//     const powedPrice = price * Math.pow(10, pow)
//
//     console.log({ tick, pow, powedPrice, price })
//
//     const normalized = Math.round(powedPrice) / Math.pow(10, pow)
//
//     return normalized
// }
//
export const getTickSizeOf = (price: number) => {
  const pow = price.toString().split(".")[1]?.length ?? 0;

  return 1 / Math.pow(10, pow);
};
//
//
export const takeProfitPrice = (
  current: number,
  side: "LONG" | "SHORT",
  percent = 1,
  multiplier = 1,
) => {
  const c = normalizePrice(current, multiplier);

  const tp = normalizePrice(
    c * (side === "LONG" ? 1 + percent / 100 : 1 - percent / 100),
    multiplier,
  );

  console.log({ c, percent, tp });

  return tp;
};

export const securityOrder = (
  current: number,
  side: "LONG" | "SHORT",
  percent = 1,
  multiplier = 1,
) => {
  const c = normalizePrice(current, multiplier);

  const pow = getPow(multiplier);

  const so = normalizePrice(
    c * (side === "LONG" ? 1 - percent / 100 : 1 + percent / 100),
    multiplier,
  );

  console.log({ c, percent, side, so });

  return so;
};
