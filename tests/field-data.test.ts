import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IData } from '@lark-base-open/js-sdk';
import { unpivotFieldCounts } from '../src/field-data.ts';
import { defaultConfig, matrixFromData, percentMatrix } from '../src/model.ts';

test('文本状态按字段分别堆积，兼容 SDK 返回字符串记录数', () => {
  const fields = [{ id: 'industrial', name: '工业设计' }, { id: 'product', name: '产品设计' }];
  const data = unpivotFieldCounts([
    [{ value: '工业设计', text: '工业设计' }, { value: '完成', text: '完成' }, { value: '未完成', text: '未完成' }],
    [{ value: '完成', text: '完成' }, { value: '12', text: '12' }, { value: '8', text: '8' }],
    [{ value: '未完成', text: '未完成' }, { value: 5, text: '5' }, { value: ' 5 ', text: '5' }],
  ], fields);
  const config = defaultConfig();
  config.chartType = 'stacked';
  config.sources[0].axisFields = fields;
  const matrix = matrixFromData(data, config);
  assert.deepEqual(matrix.categories, ['工业设计', '产品设计']);
  assert.deepEqual(matrix.values[matrix.series.indexOf('完成')], [20, 17]);
  assert.deepEqual(matrix.values[matrix.series.indexOf('未完成')], [10, 13]);
  for (let column = 0; column < 2; column++) {
    assert.equal(matrix.values.reduce((total, series) => total + series[column], 0), 30);
    assert.ok(Math.abs(percentMatrix(matrix).reduce((total, series) => total + series[column], 0) - 100) < 0.000001);
  }
});

test('字符串零记录数保留为零，不把完成或未完成的文本当成度量', () => {
  const result = unpivotFieldCounts([
    [{ value: '设计状态', text: '设计状态' }, { value: '记录总数', text: '记录总数' }],
    [{ value: '完成', text: null }, { value: '0', text: '0' }],
    [{ value: '未完成', text: null }, { value: '6.0', text: '6' }],
  ], [{ id: 'status', name: '设计状态' }]);
  assert.deepEqual(result, [
    { category: '设计状态', series: '完成', value: 0 },
    { category: '设计状态', series: '未完成', value: 6 },
  ]);
});

test('缺失或非法记录数继续报错，避免将错误数据悄悄画成零', () => {
  for (const value of ['', ' ', '完成', '12件', '1,234', true, {}, -1, 'NaN', 'Infinity', '0x10', 1.5]) {
    const input = [
      [{ value: '设计状态', text: '设计状态' }, { value: '记录总数', text: '记录总数' }],
      [{ value: '完成', text: '完成' }, { value, text: '123' }],
    ] as unknown as IData;
    assert.throws(() => unpivotFieldCounts(input, [{ id: 'status', name: '设计状态' }]), /无效的字段记录数/);
  }
});
