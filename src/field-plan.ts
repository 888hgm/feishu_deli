import type { AxisField, Source } from './model.ts';

export function dashboardAnchorFields(source: Source): AxisField[] {
  // 宿主只保留一个用于关联数据源的分组，实际多字段计数由记录读取器完成。
  return (source.axisFields ?? []).slice(0, 1);
}
