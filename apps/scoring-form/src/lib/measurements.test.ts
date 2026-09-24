import { describe, expect, it } from 'vitest';
import { RowStatus, computeAreaTotals, type MeasurementRow } from './measurements';

enum Unit {
  Mm2 = 'mm²',
  Px2 = 'px²',
}

let nextNumber = 1;

function row(status: RowStatus, area?: number, unit = Unit.Mm2): MeasurementRow {
  const number = nextNumber++;
  return {
    id: `row-${number}`,
    number,
    status,
    ...(area !== undefined && { value: { area, unit } }),
  };
}

describe('computeAreaTotals', () => {
  it('is empty with no rows', () => {
    expect(computeAreaTotals([])).toStrictEqual([]);
  });

  it('sums finished rows of one unit', () => {
    const rows = [row(RowStatus.Done, 124.5), row(RowStatus.Done, 30.2), row(RowStatus.Done, 5)];

    expect(computeAreaTotals(rows)).toStrictEqual([{ unit: Unit.Mm2, area: 159.7 }]);
  });

  it('counts only finished rows that have an area', () => {
    const rows = [
      row(RowStatus.Done, 10),
      row(RowStatus.Pending),
      row(RowStatus.Drawing),
      row(RowStatus.Done),
      row(RowStatus.Failed, 99),
    ];

    expect(computeAreaTotals(rows)).toStrictEqual([{ unit: Unit.Mm2, area: 10 }]);
  });

  it('is empty when no row is finished', () => {
    const rows = [row(RowStatus.Pending), row(RowStatus.Drawing), row(RowStatus.Failed, 99)];

    expect(computeAreaTotals(rows)).toStrictEqual([]);
  });

  it('keeps one sum per unit, in the order the units first appear', () => {
    const rows = [
      row(RowStatus.Done, 30, Unit.Px2),
      row(RowStatus.Done, 124.5, Unit.Mm2),
      row(RowStatus.Done, 12.5, Unit.Px2),
    ];

    expect(computeAreaTotals(rows)).toStrictEqual([
      { unit: Unit.Px2, area: 42.5 },
      { unit: Unit.Mm2, area: 124.5 },
    ]);
  });

  it('hides floating-point noise', () => {
    const rows = [row(RowStatus.Done, 0.1), row(RowStatus.Done, 0.2)];

    expect(computeAreaTotals(rows)).toStrictEqual([{ unit: Unit.Mm2, area: 0.3 }]);
  });
});
