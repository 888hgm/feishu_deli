import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig, type Config } from '../src/model.ts';
import { loadRecordCounts, type RecordBase, type RecordItem } from '../src/record-counts.ts';
import { detailText, loadRecordDetails, searchDetailRows } from '../src/record-details.ts';

const fields = ['项目策划是否完成', '工业设计是否完成', '首样评审是否完成', '测试是否完成'].map((name, i) => ({ id: `status${i}`, name }));
function config(): Config {
  const value = defaultConfig(); value.sources = [{ tableId: 'a', category: '', series: '', metric: '', axisFields: fields }];
  return value;
}
function base(rows: RecordItem[]): RecordBase {
  return { async getTableById(id) { return {
    async getName() { return `项目表 ${id}`; },
    async getFieldMetaList() { return [{ id: 'name', name: '项目名称' }, ...fields, { id: id === 'a' ? 'company' : 'company2', name: '产品公司' }, { id: 'image', name: '图片' }]; },
    async getRecordsByPage({ pageToken, stringValue }) {
      assert.equal(stringValue, true);
      const start = pageToken ?? 0;
      return { records: rows.slice(Math.max(0, start - 1), start + 200), hasMore: start + 200 < rows.length, pageToken: start + 200 };
    },
  }; } };
}
const segment = { category: fields[2].name, series: '未完成', count: 0 };

test('点击第三个字段的未完成段，只返回该字段未完成且符合原始筛选的所有分页记录', async () => {
  const rows = Array.from({ length: 481 }, (_, i) => ({ recordId: String(i), fields: { name: `项目${i}`, company: i % 3 ? 'A' : 'B', ...Object.fromEntries(fields.map((f, n) => [f.id, (i + n) % 2 ? '未完成' : '完成'])) } }));
  const value = config(); value.rowFilters = [{ fieldId: 'company', fieldName: '产品公司', operator: 'eq', value: 'A' }];
  const source = base(rows);
  const counts = await loadRecordCounts(source, value), details = await loadRecordDetails(source, value, segment);
  const expected = rows.filter(row => row.fields.company === 'A' && Number(row.recordId) % 2 === 1);
  assert.deepEqual(details.rows.map(row => row.recordId), expected.map(row => row.recordId));
  assert.equal(details.rows.length, counts.find(item => item.category === segment.category && item.series === segment.series)!.value);
  assert.equal(new Set(details.rows.map(row => row.recordId)).size, details.rows.length);
  assert.ok(details.columns.includes('项目名称'));
  assert.ok(details.rows.every(row => row.cells[fields[2].name] === '未完成'));
});

test('未填写段与完成段分别按统计时相同的完整文本归类', async () => {
  const value = config(), f = fields[2].id;
  const source = base([{ recordId: '0', fields: { [f]: ' 完成 ' } }, { recordId: '1', fields: { [f]: '未完成' } }, { recordId: '2', fields: { [f]: '' } }, { recordId: '3', fields: {} }]);
  assert.deepEqual((await loadRecordDetails(source, value, { ...segment, series: '完成' })).rows.map(row => row.recordId), ['0']);
  assert.deepEqual((await loadRecordDetails(source, value, { ...segment, series: '未填写' })).rows.map(row => row.recordId), ['2', '3']);
});

test('多个来源中相同 recordId 保留来源身份，筛选字段按同名映射', async () => {
  const value = config(); value.multi = true; value.sources.push({ ...value.sources[0], tableId: 'b' });
  value.rowFilters = [{ fieldId: 'company', fieldName: '产品公司', operator: 'eq', value: 'A' }];
  const details = await loadRecordDetails(base([{ recordId: 'same', fields: { company: 'A', company2: 'A', [fields[2].id]: '未完成' } }]), value, segment);
  assert.deepEqual(details.rows.map(row => [row.tableId, row.recordId]), [['a', 'same'], ['b', 'same']]);
});

test('搜索覆盖所有明细字段和来源名称，首尾空白与英文大小写不影响匹配', async () => {
  const details = await loadRecordDetails(base([{ recordId: '1', fields: { name: 'Project Alpha', [fields[2].id]: '未完成' } }]), config(), segment);
  assert.equal(searchDetailRows(details.rows, ' ALPHA ').length, 1);
  assert.equal(searchDetailRows(details.rows, '项目表').length, 1);
  assert.equal(searchDetailRows(details.rows, '完成').length, 1);
  assert.equal(searchDetailRows(details.rows, '不存在').length, 0);
});

test('读取失败或取消不会返回部分明细，未选择的字段不能作为下钻入口', async () => {
  const source = base([{ recordId: '1', fields: {} }]);
  const original = source.getTableById;
  source.getTableById = async id => ({ ...await original(id), async getRecordsByPage() { throw new Error('权限不足'); } });
  await assert.rejects(loadRecordDetails(source, config(), segment), /权限不足/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadRecordDetails(base([]), config(), segment, controller.signal), { name: 'AbortError' });
  await assert.rejects(loadRecordDetails(base([]), config(), { ...segment, category: '已删除字段' }), /不在统计范围/);
});

test('文本安全保留供界面转义，附件只展示名称，未知对象不生成 HTML', () => {
  assert.equal(detailText('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>');
  assert.equal(detailText([{ name: '产品图.png', url: 'https://example.com/private' }]), '产品图.png');
  assert.equal(detailText([{ text: '项目' }, { text: '一' }]), '项目一');
  assert.equal(detailText(false), 'false');
  assert.equal(detailText({ unexpected: 'value' }), '（请打开记录查看）');
});
