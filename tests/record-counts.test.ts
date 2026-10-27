import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig, hydrateConfig, matrixFromData, percentMatrix, type RowFilter } from '../src/model.ts';
import { loadRecordCounts, matchesFilter, cellText, type RecordTable } from '../src/record-counts.ts';

const fields = ['策划', '工业设计', '结构手板', '测试'].map((name, index) => ({ id: String(index), name }));
function config() { const value = defaultConfig(); value.sources = [{ tableId: 'table', category: '', series: '', metric: '', axisFields: fields }]; return value; }
const rule = (operator: RowFilter['operator'], value = 'A'): RowFilter => ({ fieldId: 'company', fieldName: '公司', operator, value });

test('超过 200 条记录分页读取，四个文本字段分别计数，翻页重复记录不重复计算', async () => {
  const calls: number[] = [];
  const records = Array.from({ length: 241 }, (_, index) => ({ recordId: String(index), fields: Object.fromEntries(fields.map((field, f) => [field.id, (index + f) % 2 ? '未完成' : '完成'])) }));
  const table: RecordTable = {
    async getFieldMetaList() { return fields; },
    async getRecordsByPage(params) {
      assert.equal(params.stringValue, true); assert.equal(params.pageSize, 200);
      const start = params.pageToken ?? 0; calls.push(start);
      return start === 0 ? { records: records.slice(0, 200), hasMore: true, pageToken: 200 } : { records: records.slice(199), hasMore: false };
    },
  };
  const data = await loadRecordCounts({ async getTableById() { return table; } }, config());
  const matrix = matrixFromData(data, config());
  assert.deepEqual(calls, [0, 200]);
  assert.deepEqual(matrix.categories, fields.map(field => field.name));
  assert.deepEqual(matrix.values[matrix.series.indexOf('完成')], [121, 120, 121, 120]);
  for (let index = 0; index < fields.length; index++) {
    assert.equal(matrix.values.reduce((sum, series) => sum + series[index], 0), 241);
    assert.ok(Math.abs(percentMatrix(matrix).reduce((sum, series) => sum + series[index], 0) - 100) < 0.000001);
  }
});

test('六种筛选运算符按完整文本和空值语义判断', () => {
  assert.equal(matchesFilter('A', rule('eq')), true);
  assert.equal(matchesFilter('AB', rule('eq')), false);
  assert.equal(matchesFilter('AB', rule('neq')), true);
  assert.equal(matchesFilter('AB', rule('contains')), true);
  assert.equal(matchesFilter('B', rule('notContains')), true);
  for (const empty of [null, undefined, '', '  ']) assert.equal(matchesFilter(empty, rule('empty')), true);
  assert.equal(matchesFilter(0, rule('notEmpty')), true);
  assert.equal(matchesFilter(false, rule('notEmpty')), true);
});

test('先按公司及状态过滤记录，再独立汇总字段，支持全部和任一条件', async () => {
  const first = fields[0];
  const records = [
    { recordId: '1', fields: { company: 'A', '0': '完成', '1': '未完成', '2': '完成', '3': '完成' } },
    { recordId: '2', fields: { company: 'A', '0': '未完成', '1': '完成', '2': '未完成', '3': '完成' } },
    { recordId: '3', fields: { company: 'B', '0': '完成', '1': '完成', '2': '完成', '3': '未完成' } },
  ];
  const table: RecordTable = { async getFieldMetaList() { return [...fields, { id: 'company', name: '公司' }]; }, async getRecordsByPage() { return { records, hasMore: false }; } };
  const value = config(); value.rowFilters = [rule('eq'), { fieldId: first.id, fieldName: first.name, operator: 'eq', value: '完成' }];
  const base = { async getTableById() { return table; } };
  const all = matrixFromData(await loadRecordCounts(base, value), value);
  assert.deepEqual(all.values[all.series.indexOf('完成')], [1, 0, 1, 1]);
  value.filterLogic = 'any';
  const any = matrixFromData(await loadRecordCounts(base, value), value);
  assert.deepEqual(any.values[any.series.indexOf('完成')], [2, 2, 2, 2]);
  assert.deepEqual(hydrateConfig(JSON.parse(JSON.stringify(value))).rowFilters, value.rowFilters);
});

test('空文本单独计为未填写，完成与未完成不会按子串混算', async () => {
  assert.equal(cellText([{ text: '未' }, { text: '完成' }]), '未完成');
  const value = config(); value.sources[0].axisFields = [fields[0]];
  const table: RecordTable = { async getFieldMetaList() { return fields; }, async getRecordsByPage() { return { records: [
    { recordId: '1', fields: { '0': '完成' } }, { recordId: '2', fields: { '0': '未完成' } }, { recordId: '3', fields: {} },
  ], hasMore: false }; } };
  assert.deepEqual(await loadRecordCounts({ async getTableById() { return table; } }, value), [
    { category: '策划', series: '完成', value: 1 }, { category: '策划', series: '未完成', value: 1 }, { category: '策划', series: '未填写', value: 1 },
  ]);
});

test('分页失败、重复游标或字段不可用时报告错误，不返回截断的结果', async () => {
  const table: RecordTable = { async getFieldMetaList() { return fields; }, async getRecordsByPage() { return { records: [], hasMore: true, pageToken: 1 }; } };
  const base = { async getTableById() { return table; } };
  await assert.rejects(loadRecordCounts(base, config()), /分页标记/);
  table.getRecordsByPage = async () => { throw new Error('权限不足'); };
  await assert.rejects(loadRecordCounts(base, config()), /权限不足/);
  table.getFieldMetaList = async () => [];
  await assert.rejects(loadRecordCounts(base, config()), /横轴字段不可用/);
});

test('多数据表的同名筛选字段映射至各自字段 ID', async () => {
  const value = config(); value.multi = true; value.rowFilters = [rule('eq')];
  value.sources.push({ ...value.sources[0], tableId: 'second' });
  const data = await loadRecordCounts({ async getTableById(id) {
    const company = id === 'table' ? 'company' : 'company2';
    return { async getFieldMetaList() { return [...fields, { id: company, name: '公司' }]; }, async getRecordsByPage() { return { records: [{ recordId: '1', fields: { [company]: 'A', ...Object.fromEntries(fields.map(field => [field.id, '完成'])) } }], hasMore: false }; } };
  } }, value);
  assert.deepEqual(matrixFromData(data, value).values, [[2, 2, 2, 2]]);
});
