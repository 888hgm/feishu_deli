import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IData } from '@lark-base-open/js-sdk';
import { unpivotFieldCounts } from '../src/field-data.ts';
import { defaultConfig, matrixFromData } from '../src/model.ts';
import { decodeDashboardMatrix } from '../src/dashboard-data.ts';

test('按官方示例的带表头交叉表解析两个状态字段，不把第一行状态标签当作记录数', () => {
  const fields = [{ id: 'a', name: '工业设计是否完成' }, { id: 'b', name: '产品设计是否完成' }];
  const data = [
    [{ value: '工业设计是否完成', text: '工业设计是否完成', groupKey: null }, { value: '完成', text: '完成', groupKey: '完成' }, { value: '未完成', text: '未完成', groupKey: '未完成' }],
    [{ value: '完成', text: '完成', groupKey: '完成' }, { value: 12, text: '12', groupKey: null }, { value: 8, text: '8', groupKey: null }],
    [{ value: '未完成', text: '未完成', groupKey: '未完成' }, { value: 5, text: '5', groupKey: null }, { value: 5, text: '5', groupKey: null }],
  ] as unknown as IData;
  const config = defaultConfig(); config.sources[0].axisFields = fields;
  const matrix = matrixFromData(unpivotFieldCounts(data, fields), config);
  assert.deepEqual(matrix.categories, ['工业设计是否完成', '产品设计是否完成']);
  assert.deepEqual(matrix.values[matrix.series.indexOf('完成')], [20, 17]);
  assert.deepEqual(matrix.values[matrix.series.indexOf('未完成')], [10, 13]);
});

test('单字段表头不参与统计，缺失的交叉组合按零处理，空表保留空结果', () => {
  const fields = [{ id: 'a', name: '状态' }];
  assert.deepEqual(unpivotFieldCounts([
    [{ value: '状态', text: '状态' }, { value: '记录总数', text: '记录总数' }],
    [{ value: '完成', text: '完成' }, { value: '7', text: '7' }],
    [{ value: '未完成', text: '未完成' }, { value: null, text: null }],
  ], fields), [
    { category: '状态', series: '完成', value: 7 },
    { category: '状态', series: '未完成', value: 0 },
  ]);
  assert.deepEqual(unpivotFieldCounts([], fields), []);
  assert.deepEqual(unpivotFieldCounts([[{ value: '状态', text: '状态' }, { value: '记录总数', text: '记录总数' }]], fields), []);
});

test('三个字段按可验证的行维度展开，拒绝未知的多字段表头布局', () => {
  const fields = [{ id: 'a', name: '策划' }, { id: 'b', name: '设计' }, { id: 'c', name: '测试' }];
  const data: IData = [
    [{ value: '策划', text: '策划' }, { value: '设计', text: '设计' }, { value: '完成', text: '完成' }, { value: '未完成', text: '未完成' }],
    [{ value: '完成', text: '完成' }, { value: '未完成', text: '未完成' }, { value: '3', text: '3' }, { value: 2, text: '2' }],
  ];
  const config = defaultConfig(); config.sources[0].axisFields = fields;
  const matrix = matrixFromData(unpivotFieldCounts(data, fields), config);
  assert.deepEqual(matrix.values[matrix.series.indexOf('完成')], [5, 0, 3]);
  assert.deepEqual(matrix.values[matrix.series.indexOf('未完成')], [0, 5, 2]);
  const wrong = structuredClone(data); wrong[0][1] = { value: '未知布局', text: '未知布局' };
  assert.throws(() => unpivotFieldCounts(wrong, fields), /布局/);
});

test('单字段分类的数值统计同样跳过表头，保留负数和小数', () => {
  assert.deepEqual(decodeDashboardMatrix([
    [{ value: '公司', text: '公司' }, { value: '金额', text: '金额' }],
    [{ value: '公司A', text: '公司A' }, { value: '-2.5', text: '-2.5' }],
  ], [{ id: 'company', name: '公司' }], false), [{ groups: ['公司A'], value: -2.5 }]);
});

test('官方交叉表示例的数值分组标签不是度量，计数来自表体', () => {
  const fields = [{ id: 'gender', name: '性别' }, { id: 'score', name: '成绩' }];
  const data: IData = [
    [{ value: '性别', text: '性别' }, { value: 50, text: '50.0' }, { value: 60, text: '60.0' }, { value: 70, text: '70.0' }],
    [{ value: '男', text: '男' }, { value: 1, text: '1' }, { value: 1, text: '1' }, { value: 2, text: '2' }],
    [{ value: '女', text: '女' }, { value: 2, text: '2' }, { value: 1, text: '1' }, { value: 1, text: '1' }],
  ];
  const config = defaultConfig(); config.sources[0].axisFields = fields;
  const matrix = matrixFromData(unpivotFieldCounts(data, fields), config);
  assert.deepEqual(matrix.values[matrix.series.indexOf('男')], [4, 0]);
  assert.deepEqual(matrix.values[matrix.series.indexOf('女')], [4, 0]);
  assert.deepEqual(matrix.values[matrix.series.indexOf('50.0')], [0, 3]);
  assert.deepEqual(matrix.values[matrix.series.indexOf('60.0')], [0, 2]);
  assert.deepEqual(matrix.values[matrix.series.indexOf('70.0')], [0, 3]);
});
