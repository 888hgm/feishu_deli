import type { Config, Datum, RowFilter } from './model.ts';

interface RecordItem { recordId: string; fields: Record<string, unknown> }
interface RecordPage { records: RecordItem[]; hasMore: boolean; pageToken?: number }
export interface RecordTable {
  getFieldMetaList(): Promise<{ id: string; name: string }[]>;
  getRecordsByPage(params: { pageSize: number; pageToken?: number; stringValue: boolean }): Promise<RecordPage>;
}
export interface RecordBase { getTableById(id: string): Promise<RecordTable> }

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return String(value).trim();
  // 正常调用 stringValue:true 会直接返回文本；兼容仍返回文本片段的宿主。
  if (Array.isArray(value) && value.every(item => item && typeof item.text === 'string')) return value.map(item => item.text).join('').trim();
  if (typeof value === 'object' && value && 'text' in value && typeof value.text === 'string') return value.text.trim();
  throw new Error('字段未返回可读文本，请检查该字段是否支持文本显示');
}

export function matchesFilter(value: unknown, rule: RowFilter): boolean {
  const text = cellText(value), expected = rule.value.trim();
  switch (rule.operator) {
    case 'eq': return text === expected;
    case 'neq': return text !== expected;
    case 'contains': return text.includes(expected);
    case 'notContains': return !text.includes(expected);
    case 'empty': return text === '';
    case 'notEmpty': return text !== '';
  }
}

/** 分页读取当前账号可读的全表记录，先筛选记录，再对任意数量的字段独立计数。 */
export async function loadRecordCounts(base: RecordBase, config: Config, signal?: AbortSignal): Promise<Datum[]> {
  const result: Datum[] = [];
  const sources = config.multi ? config.sources : config.sources.slice(0, 1);
  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
    const source = sources[sourceIndex], fields = source.axisFields ?? [];
    if (!fields.length) throw new Error('请至少选择一个横轴字段');
    signal?.throwIfAborted();
    const table = await base.getTableById(source.tableId);
    const metas = await table.getFieldMetaList();
    if (fields.some(field => !metas.some(meta => meta.id === field.id))) throw new Error('横轴字段不可用，请重新选择');
    const rules = config.rowFilters.map(rule => {
      const field = sourceIndex === 0 ? metas.find(meta => meta.id === rule.fieldId) : metas.find(meta => meta.name === rule.fieldName);
      if (!field) throw new Error(`筛选字段“${rule.fieldName}”不可用，请重新设置筛选条件`);
      return { ...rule, fieldId: field.id };
    });
    const counts = fields.map(() => new Map<string, number>());
    const seenRecords = new Set<string>(), seenTokens = new Set<number>();
    let pageToken: number | undefined;
    while (true) {
      signal?.throwIfAborted();
      const page = await table.getRecordsByPage({ pageSize: 200, stringValue: true, ...(pageToken === undefined ? {} : { pageToken }) });
      signal?.throwIfAborted();
      if (!Array.isArray(page.records)) throw new Error('飞书未返回可读取的记录列表');
      for (const record of page.records) {
        if (typeof record.recordId !== 'string' || !record.fields || typeof record.fields !== 'object') throw new Error('飞书返回的记录格式不正确');
        if (seenRecords.has(record.recordId)) continue;
        seenRecords.add(record.recordId);
        const accepted = !rules.length || (config.filterLogic === 'any' ? rules.some(rule => matchesFilter(record.fields[rule.fieldId], rule)) : rules.every(rule => matchesFilter(record.fields[rule.fieldId], rule)));
        if (!accepted) continue;
        fields.forEach((field, index) => {
          const label = cellText(record.fields[field.id]) || '未填写';
          counts[index].set(label, (counts[index].get(label) ?? 0) + 1);
        });
      }
      if (!page.hasMore) break;
      if (typeof page.pageToken !== 'number' || !Number.isFinite(page.pageToken) || seenTokens.has(page.pageToken)) throw new Error('飞书返回的分页标记异常，未展示不完整的统计结果');
      seenTokens.add(page.pageToken); pageToken = page.pageToken;
    }
    fields.forEach((field, index) => counts[index].forEach((value, series) => result.push({ category: field.name, series, value })));
  }
  return result;
}
