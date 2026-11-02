import type { RecordTable, RecordView } from './record-counts.ts';

/** table.getFieldMetaList 无序；必须用 view.getFieldMetaList 的字段 ID 排列。 */
export async function detailSchema(table: RecordTable, preferredViewId?: string) {
  const metas = await table.getFieldMetaList();
  let views: { id: string; name: string }[] = [], view: RecordView | undefined;
  let note = '';
  try { views = await table.getViewMetaList?.() ?? []; } catch { /* 有权限读取字段时仍可展示明细。 */ }
  async function fields(candidate: RecordView | undefined) {
    if (!candidate) return undefined;
    const ordered = await candidate.getFieldMetaList();
    view = candidate;
    const ids = [...new Set(ordered.map(field => field.id))];
    return [...ids.flatMap(id => metas.filter(field => field.id === id)), ...metas.filter(field => !ids.includes(field.id))];
  }
  let ordered: typeof metas | undefined;
  if (preferredViewId && table.getViewById) {
    try { ordered = await fields(await table.getViewById(preferredViewId)); }
    catch { note = '保存的参考视图暂不可用，已尝试其他视图。'; }
  }
  if (!ordered && table.getActiveView) {
    try { ordered = await fields(await table.getActiveView()); } catch { /* 仪表盘宿主可能没有当前视图。 */ }
  }
  if (!ordered && table.getViewById) for (const candidate of views) {
    try { ordered = await fields(await table.getViewById(candidate.id)); if (ordered) break; } catch { /* 跳过不可读取的视图。 */ }
  }
  if (!ordered) note += '无法读取视图列顺序，暂按接口返回顺序展示。';
  if (view && !views.some(item => item.id === view!.id)) views.push({ id: view.id, name: '当前视图' });
  return { metas: ordered ?? metas, views, viewId: view?.id ?? '', note };
}

export function visibleDetailColumns(columns: string[], keys: Record<string, string>, hidden: string[]): string[] {
  const excluded = new Set(hidden);
  return columns.filter(name => !excluded.has(keys[name] ?? name));
}
