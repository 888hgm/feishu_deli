import './details.css';
import { searchDetailRows, type DetailRow, type RecordDetails, type Segment } from './record-details';
import { visibleDetailColumns } from './detail-columns';

const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const PAGE_SIZE = 50;
type Loader = (signal: AbortSignal) => Promise<RecordDetails>;
interface DetailPreferences {
  hiddenFields(): string[];
  changeHiddenFields(keys: string[]): void;
  changeView(tableId: string, viewId: string): void;
  saveHint: string;
}

export function createDetailsDialog(parent: HTMLElement, openRecord?: (tableId: string, recordId: string, fieldIds?: string[]) => Promise<void>, preferences?: DetailPreferences) {
  const dialog = document.createElement('dialog');
  dialog.className = 'record-details';
  dialog.setAttribute('aria-labelledby', 'details-title');
  parent.append(dialog);
  let current: { controller: AbortController; segment: Segment; loader: Loader } | undefined;
  let result: RecordDetails = { columns: [], rows: [] }, filtered: DetailRow[] = [];
  let page = 0, keyword = '', rowBusy = false;
  let localHidden: string[] = [], columnsOpen = false, fieldSearch = '';
  const query = <T extends HTMLElement = HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const hiddenFields = () => preferences?.hiddenFields() ?? localHidden;
  const visibleColumns = () => visibleDetailColumns(result.columns, result.columnKeys ?? {}, hiddenFields());
  const fieldKey = (name: string) => result.columnKeys?.[name] ?? name;
  function changeHidden(keys: string[]) {
    localHidden = keys; preferences?.changeHiddenFields(keys);
    renderRows(); renderColumnList();
  }
  function renderColumnList() {
    const visible = visibleColumns();
    query('#details-column-button').textContent = `显示字段 (${visible.length}/${result.columns.length})`;
    query('#details-column-button').setAttribute('aria-expanded', String(columnsOpen));
    query('#details-column-picker').hidden = !columnsOpen;
    const matches = result.columns.map((name, index) => ({ name, index })).filter(({ name }) => name.toLocaleLowerCase().includes(fieldSearch.trim().toLocaleLowerCase()));
    query('#details-column-list').innerHTML = matches.map(({ name, index }) => `<label class="check"><input type="checkbox" data-detail-column="${index}" ${visible.includes(name) ? 'checked' : ''}><span>${escape(name)}</span></label>`).join('') || '<p class="help">未找到该字段</p>';
  }
  function close() {
    current?.controller.abort(); current = undefined;
    result = { columns: [], rows: [] }; filtered = []; keyword = ''; page = 0;
    columnsOpen = false; fieldSearch = '';
    dialog.close(); dialog.innerHTML = '';
  }
  function renderRows() {
    const columns = visibleColumns();
    filtered = searchDetailRows(result.rows, keyword, columns);
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    const first = page * PAGE_SIZE, visible = filtered.slice(first, first + PAGE_SIZE);
    query('#details-count').textContent = keyword.trim() ? `找到 ${filtered.length} 条 / 共 ${result.rows.length} 条` : `共 ${result.rows.length} 条记录`;
    query('#details-paging').innerHTML = `<span>${filtered.length ? first + 1 : 0}–${Math.min(first + PAGE_SIZE, filtered.length)} 条</span><button class="button" data-detail-action="prev" ${page === 0 ? 'disabled' : ''} aria-label="上一页">上一页</button><span>${page + 1} / ${pages}</span><button class="button" data-detail-action="next" ${page + 1 === pages ? 'disabled' : ''} aria-label="下一页">下一页</button>`;
    if (!visible.length) { query('#details-grid').innerHTML = `<p class="details-empty">${keyword.trim() ? '没有匹配搜索词的记录' : '暂无符合条件的记录'}</p>`; return; }
    const multi = new Set(result.rows.map(row => row.tableId)).size > 1;
    query('#details-grid').innerHTML = `${columns.length ? '' : '<p class="details-hidden-note">全部数据字段已隐藏，请点“显示字段”恢复。</p>'}<table class="details-table"><thead><tr><th scope="col" class="details-number">序号</th>${openRecord ? '<th scope="col" class="details-open-col">记录</th>' : ''}${multi ? '<th scope="col">来源数据表</th>' : ''}${columns.map(name => `<th scope="col" title="${escape(name)}">${escape(name)}</th>`).join('')}</tr></thead><tbody>${visible.map((row, index) => `<tr><td class="details-number">${first + index + 1}</td>${openRecord ? `<td class="details-open-col"><button class="text-button" data-detail-action="record" data-index="${first + index}" aria-label="打开第 ${first + index + 1} 条记录" ${columns.length ? '' : 'disabled'}>打开记录 ↗</button></td>` : ''}${multi ? `<td title="${escape(row.tableName)}">${escape(row.tableName)}</td>` : ''}${columns.map(name => `<td title="${escape(row.cells[name] ?? '')}">${escape(row.cells[name] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  async function load(reset = true) {
    if (!current) return;
    current.controller.abort(); current.controller = new AbortController();
    const context = current, controller = current.controller;
    result = { columns: [], rows: [] }; filtered = []; page = 0; if (reset) keyword = ''; rowBusy = false; columnsOpen = false; fieldSearch = '';
    dialog.innerHTML = `<div class="details-heading"><div><h2 id="details-title">数据详情</h2><p>${escape(context.segment.category)} <span>等于</span> <strong>${escape(context.segment.series)}</strong></p></div><button class="icon-button" data-detail-action="close" aria-label="关闭数据详情">×</button></div><label class="details-search"><span aria-hidden="true">⌕</span><input id="details-search" aria-label="搜索明细记录" placeholder="输入关键词搜索全部明细字段" disabled></label><div class="details-meta"><span id="details-count" role="status">正在读取符合条件的记录…</span><span>已应用图表中的筛选条件</span></div><div id="details-grid" class="details-grid" tabindex="0" aria-label="记录明细表格" aria-busy="true"><p class="details-empty">正在加载数据…</p></div><p id="details-notice" class="details-notice" role="status"></p><footer class="details-footer"><span>按打开时的最新记录展示${openRecord ? '；点击“打开记录”查看飞书详情' : ' · 虚构示例数据'}</span><div id="details-paging"></div></footer>`;
    query('#details-grid').insertAdjacentHTML('beforebegin', `<div class="details-tools"><label class="details-order">字段顺序<select id="details-order-view" aria-label="明细字段参考视图" disabled><option>正在读取视图…</option></select></label><button id="details-column-button" class="button" data-detail-action="columns" aria-expanded="false" aria-controls="details-column-picker" disabled>显示字段</button></div><div id="details-column-picker" class="details-column-picker" hidden><div class="details-column-heading"><strong>显示字段</strong><button class="icon-button" data-detail-action="columns" aria-label="关闭显示字段面板">×</button></div><input id="details-field-search" aria-label="搜索字段名称" placeholder="搜索字段名称"><div class="details-column-actions"><button class="text-button" data-detail-action="columns-all">显示全部</button><button class="text-button" data-detail-action="columns-none">隐藏全部</button></div><div id="details-column-list" class="details-column-list"></div><p>${escape(preferences?.saveHint ?? '取消勾选即可隐藏；关闭弹窗后本次设置仍保留。')}</p></div><p id="details-order-note" class="details-order-note"></p>`);
    query<HTMLInputElement>('#details-search').placeholder = '输入关键词搜索当前显示字段';
    query<HTMLInputElement>('#details-search').value = keyword;
    try {
      const loaded = await context.loader(controller.signal);
      if (current !== context || controller.signal.aborted) return;
      result = loaded; renderRows();
      renderColumnList();
      const viewSelect = query<HTMLSelectElement>('#details-order-view');
      viewSelect.innerHTML = (result.views ?? []).map(view => `<option value="${escape(view.id)}" ${view.id === result.viewId ? 'selected' : ''}>${escape(view.name)}</option>`).join('') || '<option value="">暂无可用参考视图</option>';
      viewSelect.disabled = !preferences || !(result.views?.length);
      query<HTMLButtonElement>('#details-column-button').disabled = false;
      query('#details-order-note').textContent = result.orderNote ?? '';
      query<HTMLInputElement>('#details-search').disabled = false;
      query('#details-grid').setAttribute('aria-busy', 'false');
      if (result.rows.length !== context.segment.count) query('#details-notice').textContent = `源数据已有变化：图中为 ${context.segment.count} 条，当前明细为 ${result.rows.length} 条。关闭后可刷新图表。`;
    } catch (error) {
      if (current !== context || controller.signal.aborted) return;
      query('#details-count').textContent = '明细读取失败';
      query('#details-grid').setAttribute('aria-busy', 'false');
      query('#details-grid').innerHTML = `<div class="details-empty details-error">${escape(error instanceof Error ? error.message : '无法读取明细，请重试')}<br><button class="button" data-detail-action="retry">重新加载</button></div>`;
    }
  }
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (columnsOpen) { columnsOpen = false; renderColumnList(); query('#details-column-button').focus(); } else close();
  });
  dialog.addEventListener('input', event => {
    if ((event.target as HTMLElement).id === 'details-field-search') { fieldSearch = (event.target as HTMLInputElement).value; renderColumnList(); return; }
    if ((event.target as HTMLElement).id !== 'details-search') return;
    keyword = (event.target as HTMLInputElement).value; page = 0; renderRows();
  });
  dialog.addEventListener('change', event => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (target.dataset.detailColumn !== undefined) {
      const name = result.columns[Number(target.dataset.detailColumn)];
      if (name === undefined) return;
      const key = fieldKey(name), hidden = hiddenFields().filter(item => item !== key);
      if (!(target as HTMLInputElement).checked) hidden.push(key);
      changeHidden(hidden);
      dialog.querySelector<HTMLInputElement>(`[data-detail-column="${target.dataset.detailColumn}"]`)?.focus();
    } else if (target.id === 'details-order-view' && result.primaryTableId && preferences) {
      preferences.changeView(result.primaryTableId, target.value); void load(false);
    }
  });
  dialog.addEventListener('click', async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-detail-action]');
    if (!button || button.disabled) return;
    switch (button.dataset.detailAction) {
      case 'close': close(); break;
      case 'prev': page--; renderRows(); break;
      case 'next': page++; renderRows(); break;
      case 'retry': void load(); break;
      case 'columns': columnsOpen = !columnsOpen; renderColumnList(); if (columnsOpen) query('#details-field-search').focus(); break;
      case 'columns-all': changeHidden(hiddenFields().filter(key => !result.columns.some(name => fieldKey(name) === key))); break;
      case 'columns-none': changeHidden([...new Set([...hiddenFields(), ...result.columns.map(fieldKey)])]); break;
      case 'record': {
        const row = filtered[Number(button.dataset.index)], context = current;
        if (!row || !openRecord || rowBusy) return;
        rowBusy = true; button.disabled = true;
        query('#details-notice').textContent = '';
        const fieldIds = visibleColumns().flatMap(name => row.fieldIds?.[name] ? [row.fieldIds[name]] : []);
        try { await openRecord(row.tableId, row.recordId, fieldIds.length ? fieldIds : undefined); }
        catch (error) { if (current === context) query('#details-notice').textContent = `无法打开飞书记录详情：${error instanceof Error ? error.message : '请确认宿主支持且有源表读取权限'}`; }
        finally { if (current === context) { rowBusy = false; button.disabled = false; } }
        break;
      }
    }
  });
  return {
    open(segment: Segment, loader: Loader) {
      current?.controller.abort();
      current = { segment, loader, controller: new AbortController() };
      void load();
      if (!dialog.open) dialog.showModal();
    },
    close,
  };
}
