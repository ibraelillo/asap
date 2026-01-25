/**
 *
 */
export const createUtils = () => {
  /**
   *
   * @param currentSize
   * @param percent
   */
  const sizePercentOf = (currentSize: number, percent: number) => {
    return (currentSize * percent) / 100;
  };

  return {
    sizePercentOf,
  };
};
