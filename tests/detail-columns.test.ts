import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detailSchema, visibleDetailColumns } from '../src/detail-columns.ts';
import { defaultConfig, hydrateConfig } from '../src/model.ts';
import { loadRecordDetails, searchDetailRows } from '../src/record-details.ts';
import { loadRecordCounts, type RecordTable } from '../src/record-counts.ts';

const metas = [{ id: 'c', name: '成本' }, { id: 's', name: '首样评审是否完成' }, { id: 'n', name: '项目名称' }];
function table(): RecordTable {
  return {
    async getFieldMetaList() { return metas; },
    async getRecordsByPage() { return { records: [{ recordId: '1', fields: { n: '项目A', s: '未完成', c: '机密词' } }], hasMore: false }; },
    async getViewMetaList() { return [{ id: 'v1', name: '项目视图' }, { id: 'v2', name: '成本视图' }]; },
    async getActiveView() { return { id: 'v1', async getFieldMetaList() { return [metas[2], metas[1], metas[0]]; } }; },
    async getViewById(id) { if (!['v1', 'v2'].includes(id)) throw new Error('视图不存在'); return { id, async getFieldMetaList() { return id === 'v1' ? [metas[2], metas[1], metas[0]] : [metas[0], metas[2], metas[1]]; } }; },
  };
}
function config() { const config = defaultConfig(); config.sources = [{ tableId: 'table', category: '', series: '', metric: '', axisFields: [metas[1]] }]; return config; }
const segment = { category: metas[1].name, series: '未完成', count: 1 };

test('明细使用视图列顺序，不使用无序的表级字段元数据', async () => {
  const schema = await detailSchema(table());
  assert.deepEqual(schema.metas.map(field => field.id), ['n', 's', 'c']);
  assert.equal(schema.viewId, 'v1'); assert.equal(schema.note, '');
  const selected = await detailSchema(table(), 'v2');
  assert.deepEqual(selected.metas.map(field => field.id), ['c', 'n', 's']);
  assert.equal(selected.viewId, 'v2');
});

test('仪表盘没有活动视图时按可用视图排序，保存的视图失效时给出提示', async () => {
  const source = table(); source.getActiveView = async () => { throw new Error('无当前视图'); };
  assert.deepEqual((await detailSchema(source)).metas.map(field => field.id), ['n', 's', 'c']);
  const deleted = await detailSchema(source, 'deleted');
  assert.equal(deleted.viewId, 'v1'); assert.match(deleted.note, /参考视图暂不可用/);
  source.getViewById = async () => { throw new Error('视图无权限'); };
  const fallback = await detailSchema(source);
  assert.deepEqual(fallback.metas, metas); assert.match(fallback.note, /无法读取视图列顺序/);
});

test('视图中的过期或重复字段 ID 不会带入已不可读字段，新字段附在末尾', async () => {
  const source = table(); source.getActiveView = async () => ({ id: 'v1', async getFieldMetaList() { return [metas[2], metas[2], { id: 'deleted', name: '已删除' }]; } });
  assert.deepEqual((await detailSchema(source)).metas.map(field => field.id), ['n', 'c', 's']);
});

test('隐藏字段用表和字段 ID 保存，重新加载和字段重命名后仍保持隐藏', async () => {
  const value = config(); value.detailHiddenFields = ['table/c']; value.detailViews = [{ tableId: 'table', viewId: 'v2' }];
  const saved = hydrateConfig(JSON.parse(JSON.stringify(value)));
  assert.deepEqual(saved.detailHiddenFields, ['table/c']); assert.deepEqual(saved.detailViews, value.detailViews);
  const data = await loadRecordDetails({ async getTableById() { return table(); } }, saved, segment);
  assert.deepEqual(data.columns, ['成本', '项目名称', '首样评审是否完成']);
  assert.deepEqual(visibleDetailColumns(data.columns, data.columnKeys!, saved.detailHiddenFields), ['项目名称', '首样评审是否完成']);
  assert.deepEqual(data.rows[0].fieldIds, Object.assign(Object.create(null), { 成本: 'c', 首样评审是否完成: 's', 项目名称: 'n' }));
  assert.deepEqual(visibleDetailColumns(['成本新名称'], { 成本新名称: 'table/c' }, saved.detailHiddenFields), []);
});

test('隐藏列不影响统计，搜索只检索显示列，支持隐藏全部后恢复', async () => {
  const value = config(), base = { async getTableById() { return table(); } };
  const before = await loadRecordCounts(base, value);
  value.detailHiddenFields = ['table/c'];
  assert.deepEqual(await loadRecordCounts(base, value), before);
  const data = await loadRecordDetails(base, value, segment), visible = visibleDetailColumns(data.columns, data.columnKeys!, value.detailHiddenFields);
  assert.equal(searchDetailRows(data.rows, '机密词', visible).length, 0);
  assert.equal(searchDetailRows(data.rows, '项目A', visible).length, 1);
  assert.deepEqual(visibleDetailColumns(data.columns, data.columnKeys!, Object.values(data.columnKeys!)), []);
  assert.deepEqual(visibleDetailColumns(data.columns, data.columnKeys!, []), data.columns);
});

test('主表没有匹配记录时，明细列仍按主表视图排序，其他表新增列附后', async () => {
  const value = config(); value.multi = true; value.sources.push({ ...value.sources[0], tableId: 'second' });
  const result = await loadRecordDetails({ async getTableById(id) {
    const source = table();
    if (id === 'table') source.getRecordsByPage = async () => ({ records: [], hasMore: false });
    return source;
  } }, value, segment);
  assert.deepEqual(result.columns, ['项目名称', '首样评审是否完成', '成本']);
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].tableId, 'second');
  assert.equal(result.columnKeys!['项目名称'], 'table/n');
});
