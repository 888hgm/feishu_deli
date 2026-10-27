import type { IData, IDataItem } from '@lark-base-open/js-sdk';
import type { AxisField } from './model.ts';
import { parseSdkNumber } from './sdk-number.ts';

export interface AggregateRow { groups: string[]; value: number }

export function dashboardLabel(cell: IDataItem): string {
  return String(cell.text ?? cell.value ?? '').trim() || '未填写';
}

/**
 * Dashboard 返回带表头的交叉表，不是逐行的“分组字段 + 度量”。
 * 两个分组时：首行 [字段名, 第二字段选项…]，表体 [第一字段选项, 计数…]。
 * 每个交叉单元格展开一次，再由调用方按各字段独立汇总。
 */
export function decodeDashboardMatrix(data: IData, groups: AxisField[], countOnly: boolean): AggregateRow[] {
  if (!data.length) return [];
  if (!groups.length) throw new Error('请至少选择一个横轴字段');
  const rowDimensions = Math.max(1, groups.length - 1);
  const header = data[0];
  if (!header || header.length <= rowDimensions || (groups.length === 1 && header.length !== 2)) {
    throw new Error('飞书返回的统计列数与配置不一致：缺少交叉表表头或统计列');
  }
  // 多于两个分组时只接受能通过字段标签验证的行维度布局，避免猜测复合标签。
  if (groups.length > 2 && groups.slice(0, rowDimensions).some((field, index) => {
    const label = dashboardLabel(header[index]);
    return label !== field.name && label !== field.id;
  })) {
    throw new Error('飞书返回的多字段交叉表布局与所选字段不匹配，请先用两个横轴字段验证');
  }
  const result: AggregateRow[] = [];
  for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex];
    if (row.length !== header.length) throw new Error(`飞书返回的统计列数不一致（第 ${rowIndex + 1} 行）`);
    const rowGroups = row.slice(0, rowDimensions).map(dashboardLabel);
    for (let column = rowDimensions; column < row.length; column++) {
      const rawValue = row[column]?.value;
      // 交叉表里没有记录的组合以空统计单元格表达，数量为零。
      const value = rawValue === null ? 0 : parseSdkNumber(rawValue);
      if (value === undefined || (countOnly && (!Number.isSafeInteger(value) || value < 0))) {
        const kind = rawValue === null ? '空值' : typeof rawValue === 'string' ? '不可用的数字文本' : typeof rawValue;
        const label = countOnly ? '无效的字段记录数' : '非数值统计结果';
        throw new Error(`飞书返回了${label}（第 ${rowIndex + 1} 行，第 ${column + 1} 列，统计值为${kind}）`);
      }
      result.push({
        groups: groups.length === 1 ? rowGroups : [...rowGroups, dashboardLabel(header[column])],
        value,
      });
    }
  }
  return result;
}
