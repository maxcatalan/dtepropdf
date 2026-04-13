function sumRange(prefixSums, start, end) {
  return prefixSums[end] - prefixSums[start];
}

function compareSolutions(a, b) {
  if (!a) return b;
  if (!b) return a;

  if (a.pageCount !== b.pageCount) {
    return a.pageCount < b.pageCount ? a : b;
  }

  if (a.penalty !== b.penalty) {
    return a.penalty < b.penalty ? a : b;
  }

  return a.lastPageFill >= b.lastPageFill ? a : b;
}

export function paginateRowsByHeights(rowHeights, capacities) {
  const heights = rowHeights.map((height) => Math.max(0, height || 0));
  const totalRows = heights.length;

  if (totalRows === 0) {
    return [[]];
  }

  const { regularPageHeight, lastPageHeight } = capacities;
  const prefixSums = new Array(totalRows + 1).fill(0);

  for (let index = 0; index < totalRows; index += 1) {
    prefixSums[index + 1] = prefixSums[index] + heights[index];
  }

  const bestFrom = new Array(totalRows + 1).fill(null);
  bestFrom[totalRows] = {
    pageCount: 0,
    penalty: 0,
    breaks: [],
    lastPageFill: 0,
  };

  for (let start = totalRows - 1; start >= 0; start -= 1) {
    let best = null;

    for (let end = start + 1; end <= totalRows; end += 1) {
      const blockHeight = sumRange(prefixSums, start, end);

      if (blockHeight > regularPageHeight && blockHeight > lastPageHeight) {
        break;
      }

      if (blockHeight <= lastPageHeight) {
        const lastWaste = Math.max(0, lastPageHeight - blockHeight);
        const candidate = {
          pageCount: 1,
          penalty: lastWaste * lastWaste,
          breaks: [end],
          lastPageFill: blockHeight,
        };

        best = compareSolutions(best, candidate);
      }

      if (end < totalRows && blockHeight <= regularPageHeight && bestFrom[end]) {
        const regularWaste = Math.max(0, regularPageHeight - blockHeight);
        const candidate = {
          pageCount: 1 + bestFrom[end].pageCount,
          penalty: regularWaste * regularWaste * 4 + bestFrom[end].penalty,
          breaks: [end, ...bestFrom[end].breaks],
          lastPageFill: bestFrom[end].lastPageFill,
        };

        best = compareSolutions(best, candidate);
      }
    }

    bestFrom[start] = best;
  }

  const bestSolution = bestFrom[0];
  if (!bestSolution) {
    return [heights.map((_, index) => index)];
  }

  const partitions = [];
  let currentStart = 0;

  for (const end of bestSolution.breaks) {
    partitions.push(
      Array.from({ length: end - currentStart }, (_, index) => currentStart + index),
    );
    currentStart = end;
  }

  return partitions;
}

export function paginateInvoiceByMeasurements(invoice, measurement) {
  if (!measurement || !measurement.rowHeights?.length) {
    return [{
      items: invoice.items,
      pageNumber: 1,
      totalPages: 1,
      isFirstPage: true,
      isLastPage: true,
    }];
  }

  const partitions = paginateRowsByHeights(measurement.rowHeights, {
    regularPageHeight: measurement.regularPageRowsHeight,
    lastPageHeight: measurement.lastPageRowsHeight,
  });

  return partitions.map((rowIndexes, index) => ({
    items: rowIndexes.map((rowIndex) => invoice.items[rowIndex]),
    pageNumber: index + 1,
    totalPages: partitions.length,
    isFirstPage: index === 0,
    isLastPage: index === partitions.length - 1,
  }));
}
