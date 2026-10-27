/** SDK 统计值允许 number 或数字字符串；不使用展示文本推测统计值。 */
export function parseSdkNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}
