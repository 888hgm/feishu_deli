import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardAnchorFields } from '../src/field-plan.ts';

test('保存四个横轴字段时不将四列塞入受限的同一个 Dashboard 分组查询', () => {
  const source = { tableId: 'table', category: '', series: '', metric: '', axisFields: ['策划', '工业设计', '结构手板', '测试'].map((name, index) => ({ id: String(index), name })) };
  const groups = dashboardAnchorFields(source);
  const hostWithTwoGroupLimit = () => { if (groups.length > 2) throw new Error('code: 800004006'); };
  assert.doesNotThrow(hostWithTwoGroupLimit);
  assert.equal(source.axisFields.length, 4);
});
