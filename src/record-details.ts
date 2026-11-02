import type { Config } from './model.ts';
import { cellText, filteredRecords, type RecordBase } from './record-counts.ts';
import { detailSchema } from './detail-columns.ts';

export interface Segment { category: string; series: string; count: number }
export interface DetailRow { tableId: string; tableName: string; recordId: string; cells: Record<string, string>; fieldIds?: Record<string, string> }
export interface RecordDetails {
  columns: string[]; rows: DetailRow[];
  columnKeys?: Record<string, string>;
  primaryTableId?: string;
  views?: { id: string; name: string }[];
  viewId?: string;
  orderNote?: string;
}

/** stringValue 模式下仍可能返回附件等结构，仅展示名称，不注入 HTML 或远程图片。 */
export function detailText(value: unknown): string {
  try { return cellText(value); } catch { /* 非文本字段可按可读名称展示。 */ }
  if (Array.isArray(value)) return value.map(detailText).filter(Boolean).join('、');
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    for (const key of ['name', 'fileName', 'title', 'link', 'url']) {
      if (typeof item[key] === 'string') return item[key];
    }
  }
  return '（请打开记录查看）';
}

export async function loadRecordDetails(base: RecordBase, config: Config, segment: Segment, signal?: AbortSignal): Promise<RecordDetails> {
  if (config.axisMode !== 'fields') throw new Error('当前仅支持多字段统计模式查看明细');
  const sources = config.multi ? config.sources : config.sources.slice(0, 1);
  if (!sources.some(source => source.axisFields?.some(field => field.name === segment.category))) throw new Error('该横轴字段已不在统计范围内，请刷新图表');
  const columns = new Set<string>(), rows: DetailRow[] = [];
  const columnKeys: Record<string, string> = Object.create(null);
  const names = new Map<string, string>();
  let primary: Awaited<ReturnType<typeof detailSchema>> | undefined;
  for (const source of sources) {
    signal?.throwIfAborted();
    const table = await base.getTableById(source.tableId);
    const schema = await detailSchema(table, config.detailViews.find(item => item.tableId === source.tableId)?.viewId);
    signal?.throwIfAborted();
    primary ??= schema;
    for (const meta of schema.metas) {
      if (!columns.has(meta.name)) columnKeys[meta.name] = `${source.tableId}/${meta.id}`;
      columns.add(meta.name);
    }
  }
  for await (const { source, metas, record } of filteredRecords(base, config, signal)) {
    const field = source.axisFields?.find(field => field.name === segment.category);
    if (!field || (cellText(record.fields[field.id]) || '未填写') !== segment.series) continue;
    if (!names.has(source.tableId)) {
      const table = await base.getTableById(source.tableId);
      names.set(source.tableId, table.getName ? await table.getName() : source.tableId);
    }
    signal?.throwIfAborted();
    const cells: Record<string, string> = Object.create(null);
    const fieldIds: Record<string, string> = Object.create(null);
    for (const meta of metas) {
      cells[meta.name] = detailText(record.fields[meta.id]);
      fieldIds[meta.name] = meta.id;
    }
    rows.push({ tableId: source.tableId, tableName: names.get(source.tableId)!, recordId: record.recordId, cells, fieldIds });
  }
  return { columns: [...columns], rows, columnKeys, primaryTableId: sources[0]?.tableId, views: primary?.views ?? [], viewId: primary?.viewId, orderNote: primary?.note };
}

export function searchDetailRows(rows: DetailRow[], keyword: string, columns?: string[]): DetailRow[] {
  const query = keyword.trim().toLocaleLowerCase();
  return query ? rows.filter(row => [row.tableName, ...(columns ? columns.map(name => row.cells[name] ?? '') : Object.values(row.cells))].some(value => value.toLocaleLowerCase().includes(query))) : rows;
}
