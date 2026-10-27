import type { IData } from '@lark-base-open/js-sdk';
import type { AxisField, Datum } from './model.ts';
import { decodeDashboardMatrix } from './dashboard-data.ts';

/** 将交叉表计数展开为每个字段独立的状态分布。 */
export function unpivotFieldCounts(data: IData, fields: AxisField[]): Datum[] {
  return decodeDashboardMatrix(data, fields, true).flatMap(row =>
    fields.map((field, index) => ({
      category: field.name,
      series: row.groups[index],
      value: row.value,
    })),
  );
}
