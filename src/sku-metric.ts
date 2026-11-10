import { parseSdkNumber } from './sdk-number.ts';

/** 空的 SKU 数量按 0 处理；拒绝负数和非数字，避免悄悄生成错误占比。 */
export function skuQuantity(value: unknown, fieldName = 'SKU数量'): number {
  if (value === null || value === undefined) return 0;
  let input = value;
  if (Array.isArray(input) && input.every(item => item && typeof item.text === 'string')) input = input.map(item => item.text).join('');
  if (input && typeof input === 'object' && 'text' in input && typeof input.text === 'string') input = input.text;
  if (typeof input === 'string') {
    let text = input.trim();
    if (!text) return 0;
    text = text.replaceAll('，', ',');
    if (text.includes(',')) {
      if (!/^[+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text)) throw new Error(`“${fieldName}”包含无效数字，请检查源表的 SKU 数量`);
      text = text.replaceAll(',', '');
    }
    input = text;
  }
  const result = parseSdkNumber(input);
  if (result === undefined || result < 0) throw new Error(`“${fieldName}”必须为非负数字，请检查源表的 SKU 数量`);
  return result;
}

export function addQuantity(total: number, value: number): number {
  const next = total + value;
  if (!Number.isFinite(next)) throw new Error('SKU 数量合计超出可用数值范围，请检查源表');
  return next;
}
