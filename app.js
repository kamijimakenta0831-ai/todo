(function () {
  'use strict';

  const Core = window.TodoCore;
  const STORAGE_KEY = 'todo-app:todos';
  const PREFS_KEY = 'todo-app:prefs';
  const PRIORITY_LABELS = { high: '高', medium: '中', low: '低' };
  const ICONS = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
    delete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };

  const els = {
    form: document.getElementById('new-form'),
    title: document.getElementById('new-title'),
    due: document.getElementById('new-due'),
    priority: document.getElementById('new-priority'),
    filters: document.getElementById('filters'),
    search: document.getElementById('search'),
    sort: document.getElementById('sort'),
    list: document.getElementById('list'),
    empty: document.getElementById('empty'),
    summary: document.getElementById('summary'),
    footer: document.getElementById('list-footer'),
    toggleAll: document.getElementById('toggle-all'),
    clearCompleted: document.getElementById('clear-completed'),
  };

  const state = {
    todos: loadTodos(),
    filter: 'all',
    sort: 'created',
    query: '',
    editingId: null,
    ...loadPrefs(),
  };

  // ---- 保存 ----

  // プライベートモード等で localStorage が使えなくてもアプリ自体は動かす
  function readStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      console.warn('保存に失敗しました', err);
    }
  }

  function loadTodos() {
    return Core.deserialize(readStorage(STORAGE_KEY));
  }

  function loadPrefs() {
    try {
      const prefs = JSON.parse(readStorage(PREFS_KEY)) || {};
      return {
        filter: Core.FILTERS.includes(prefs.filter) ? prefs.filter : 'all',
        sort: Core.SORTS.includes(prefs.sort) ? prefs.sort : 'created',
      };
    } catch {
      return {};
    }
  }

  function savePrefs() {
    writeStorage(PREFS_KEY, JSON.stringify({ filter: state.filter, sort: state.sort }));
  }

  function commit(todos) {
    state.todos = todos;
    writeStorage(STORAGE_KEY, Core.serialize(todos));
    render();
  }

  // ---- 描画 ----

  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('aria-')) node.setAttribute(key, value);
      else node[key] = value;
    }
    node.append(...children.filter((child) => child != null && child !== false));
    return node;
  }

  function iconButton(icon, action, label, extraClass = '') {
    const button = h('button', {
      type: 'button',
      className: `icon-button ${extraClass}`.trim(),
      title: label,
      'aria-label': label,
      dataset: { action },
    });
    button.innerHTML = ICONS[icon]; // 固定の SVG 文字列のみ
    return button;
  }

  function formatDue(due, today) {
    const days = Core.daysUntil(due, today);
    if (days < 0) return `${-days}日超過`;
    if (days === 0) return '今日まで';
    if (days === 1) return '明日まで';
    const [y, m, d] = due.split('-').map(Number);
    return due.slice(0, 4) === today.slice(0, 4) ? `${m}/${d}まで` : `${y}/${m}/${d}まで`;
  }

  function renderItem(todo, today) {
    const classes = ['todo-item'];
    if (todo.done) classes.push('is-done');
    if (Core.isOverdue(todo, today)) classes.push('is-overdue');

    return h('li', { className: classes.join(' '), dataset: { id: todo.id } },
      h('input', {
        type: 'checkbox',
        className: 'todo-toggle',
        checked: todo.done,
        'aria-label': `「${todo.title}」を完了にする`,
        dataset: { action: 'toggle' },
      }),
      h('div', { className: 'todo-body' },
        h('span', { className: 'todo-title', title: 'ダブルクリックで編集' }, todo.title),
        h('div', { className: 'todo-meta' },
          h('span', { className: `badge badge-${todo.priority}` }, `優先度 ${PRIORITY_LABELS[todo.priority]}`),
          todo.due && h('span', { className: 'todo-due', title: `期限 ${todo.due}` }, formatDue(todo.due, today)),
        ),
      ),
      h('div', { className: 'todo-actions' },
        iconButton('edit', 'edit', `「${todo.title}」を編集`),
        iconButton('delete', 'delete', `「${todo.title}」を削除`, 'danger'),
      ),
    );
  }

  function renderEditor(todo) {
    return h('li', { className: 'todo-item is-editing', dataset: { id: todo.id } },
      h('form', { className: 'edit-form' },
        h('input', {
          type: 'text',
          name: 'title',
          className: 'edit-title',
          value: todo.title,
          maxLength: Core.MAX_TITLE_LENGTH,
          required: true,
          'aria-label': 'タスク名',
        }),
        h('div', { className: 'edit-row' },
          h('input', { type: 'date', name: 'due', value: todo.due ?? '', 'aria-label': '期限' }),
          h('select', { name: 'priority', 'aria-label': '優先度' },
            ...Core.PRIORITIES.map((p) =>
              h('option', { value: p, selected: p === todo.priority }, `優先度 ${PRIORITY_LABELS[p]}`)),
          ),
          h('span', { className: 'spacer' }),
          h('button', { type: 'button', className: 'button subtle', dataset: { action: 'cancel' } }, 'キャンセル'),
          h('button', { type: 'submit', className: 'button primary' }, '保存'),
        ),
      ),
    );
  }

  function render() {
    const focus = captureFocus();
    const today = Core.toDateString(new Date());
    const visible = Core.visibleTodos(state.todos, state);
    const stats = Core.getStats(state.todos, today);

    els.list.replaceChildren(...visible.map((todo) =>
      todo.id === state.editingId ? renderEditor(todo) : renderItem(todo, today)));
    els.list.hidden = visible.length === 0;

    els.empty.hidden = visible.length > 0;
    els.empty.textContent = stats.total === 0
      ? 'タスクはまだありません。上の入力欄から追加しましょう。'
      : '条件に一致するタスクはありません。';

    els.summary.textContent = stats.total === 0
      ? ''
      : `残り ${stats.active} 件 / 全 ${stats.total} 件` +
        (stats.overdue ? ` ・ 期限切れ ${stats.overdue} 件` : '');

    for (const button of els.filters.querySelectorAll('[data-filter]')) {
      button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter));
    }
    els.sort.value = state.sort;

    els.footer.hidden = stats.total === 0;
    els.toggleAll.checked = stats.total > 0 && stats.active === 0;
    els.clearCompleted.disabled = stats.done === 0;
    els.clearCompleted.textContent = stats.done ? `完了済みを削除 (${stats.done})` : '完了済みを削除';

    restoreFocus(focus);
  }

  // 一覧は丸ごと作り直すので、操作中の項目のフォーカスを引き継ぐ
  function captureFocus() {
    const active = document.activeElement;
    const item = active && active.closest('.todo-item');
    if (!item || !els.list.contains(item) || !active.dataset.action) return null;
    return { id: item.dataset.id, action: active.dataset.action };
  }

  function restoreFocus(focus) {
    if (focus) focusItemControl(focus.id, focus.action);
  }

  function focusItemControl(id, action) {
    const item = [...els.list.children].find((li) => li.dataset.id === id);
    const target = item && item.querySelector(`[data-action="${action}"]`);
    if (target) target.focus();
  }

  // ---- 操作 ----

  function itemId(node) {
    return node.closest('.todo-item').dataset.id;
  }

  function startEdit(id) {
    state.editingId = id;
    render();
    const input = els.list.querySelector('.edit-title');
    if (input) {
      input.focus();
      input.select();
    }
  }

  function stopEdit() {
    const id = state.editingId;
    state.editingId = null;
    render();
    focusItemControl(id, 'edit');
  }

  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const next = Core.addTodo(state.todos, els.title.value, {
      due: els.due.value,
      priority: els.priority.value,
    });
    if (next === state.todos) {
      els.title.focus();
      return;
    }
    // 追加したタスクが絞り込みで隠れないようにする
    if (state.filter === 'completed') {
      state.filter = 'all';
      savePrefs();
    }
    state.query = '';
    els.search.value = '';
    els.form.reset();
    commit(next);
    els.title.focus();
  });

  els.filters.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    state.filter = button.dataset.filter;
    savePrefs();
    render();
  });

  els.search.addEventListener('input', () => {
    state.query = els.search.value;
    render();
  });

  els.sort.addEventListener('change', () => {
    state.sort = els.sort.value;
    savePrefs();
    render();
  });

  els.toggleAll.addEventListener('change', () => {
    commit(Core.setAllDone(state.todos, els.toggleAll.checked));
  });

  els.clearCompleted.addEventListener('click', () => {
    commit(Core.clearCompleted(state.todos));
    els.title.focus();
  });

  els.list.addEventListener('change', (event) => {
    if (event.target.dataset.action === 'toggle') {
      commit(Core.toggleTodo(state.todos, itemId(event.target)));
    }
  });

  els.list.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = itemId(button);
    switch (button.dataset.action) {
      case 'edit':
        startEdit(id);
        break;
      case 'delete':
        commit(Core.removeTodo(state.todos, id));
        els.title.focus();
        break;
      case 'cancel':
        stopEdit();
        break;
    }
  });

  els.list.addEventListener('dblclick', (event) => {
    const title = event.target.closest('.todo-title');
    if (title) startEdit(itemId(title));
  });

  els.list.addEventListener('submit', (event) => {
    event.preventDefault();
    const id = itemId(event.target);
    const data = new FormData(event.target);
    state.editingId = null;
    commit(Core.updateTodo(state.todos, id, {
      title: data.get('title'),
      due: data.get('due'),
      priority: data.get('priority'),
    }));
    focusItemControl(id, 'edit');
  });

  els.list.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && event.target.closest('.edit-form')) {
      event.preventDefault();
      stopEdit();
    }
  });

  // 別タブでの変更を反映する
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      state.todos = loadTodos();
      render();
    }
  });

  // 日付が変わった後に戻ってきたとき、期限表示を更新する
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.editingId === null) render();
  });

  render();
})();
