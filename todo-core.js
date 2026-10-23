/**
 * TODO アプリのデータ操作 (DOM に依存しない部分)。
 * ブラウザでは window.TodoCore、Node では module.exports として使える。
 * 配列を受け取る関数はすべて元の配列を変更せず、新しい配列を返す。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.TodoCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PRIORITIES = ['high', 'medium', 'low'];
  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
  const DEFAULT_PRIORITY = 'medium';
  const FILTERS = ['all', 'active', 'completed'];
  const SORTS = ['created', 'due', 'priority'];
  const MAX_TITLE_LENGTH = 200;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const DAY_MS = 24 * 60 * 60 * 1000;

  function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function normalizeTitle(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH);
  }

  /** "YYYY-MM-DD" 形式かつ実在する日付なら返し、それ以外は null。 */
  function normalizeDue(value) {
    if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? value : null;
  }

  function normalizePriority(value) {
    return PRIORITIES.includes(value) ? value : DEFAULT_PRIORITY;
  }

  function createTodo(title, options = {}) {
    const normalized = normalizeTitle(title);
    if (!normalized) return null;
    return {
      id: generateId(),
      title: normalized,
      done: false,
      due: normalizeDue(options.due),
      priority: normalizePriority(options.priority),
      createdAt: options.now ?? Date.now(),
      completedAt: null,
    };
  }

  /** タイトルが空なら元の配列をそのまま返す。 */
  function addTodo(todos, title, options) {
    const todo = createTodo(title, options);
    return todo ? [...todos, todo] : todos;
  }

  function updateTodo(todos, id, changes) {
    return todos.map((todo) => {
      if (todo.id !== id) return todo;
      const next = { ...todo };
      if ('title' in changes) {
        const title = normalizeTitle(changes.title);
        if (title) next.title = title; // 空のタイトルへの変更は無視する
      }
      if ('due' in changes) next.due = normalizeDue(changes.due);
      if ('priority' in changes) next.priority = normalizePriority(changes.priority);
      return next;
    });
  }

  function setDone(todo, done, now) {
    if (todo.done === done) return todo;
    return { ...todo, done, completedAt: done ? now : null };
  }

  function toggleTodo(todos, id, now = Date.now()) {
    return todos.map((todo) => (todo.id === id ? setDone(todo, !todo.done, now) : todo));
  }

  function setAllDone(todos, done, now = Date.now()) {
    return todos.map((todo) => setDone(todo, done, now));
  }

  function removeTodo(todos, id) {
    return todos.filter((todo) => todo.id !== id);
  }

  function clearCompleted(todos) {
    return todos.filter((todo) => !todo.done);
  }

  /** ローカル時刻での "YYYY-MM-DD"。 */
  function toDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** today から due までの日数 (過ぎていれば負)。 */
  function daysUntil(due, today) {
    const toUtc = (s) => {
      const [y, m, d] = s.split('-').map(Number);
      return Date.UTC(y, m - 1, d);
    };
    return Math.round((toUtc(due) - toUtc(today)) / DAY_MS);
  }

  function isOverdue(todo, today) {
    return !todo.done && todo.due !== null && todo.due < today;
  }

  function compareDue(a, b) {
    if (a.due === b.due) return 0;
    if (a.due === null) return 1; // 期限なしは最後
    if (b.due === null) return -1;
    return a.due < b.due ? -1 : 1;
  }

  /** 絞り込み・検索・並べ替えを適用した一覧。同順位は追加順を保つ (sort は安定)。 */
  function visibleTodos(todos, { filter = 'all', query = '', sort = 'created' } = {}) {
    const q = query.trim().toLowerCase();
    const result = todos.filter((todo) => {
      if (filter === 'active' && todo.done) return false;
      if (filter === 'completed' && !todo.done) return false;
      return !q || todo.title.toLowerCase().includes(q);
    });
    if (sort === 'due') {
      result.sort(compareDue);
    } else if (sort === 'priority') {
      result.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
    }
    return result;
  }

  function getStats(todos, today) {
    let done = 0;
    let overdue = 0;
    for (const todo of todos) {
      if (todo.done) done++;
      else if (isOverdue(todo, today)) overdue++;
    }
    return { total: todos.length, done, active: todos.length - done, overdue };
  }

  function serialize(todos) {
    return JSON.stringify({ version: 1, todos });
  }

  function sanitizeTodo(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = normalizeTitle(raw.title);
    if (!title) return null;
    const done = raw.done === true;
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : generateId(),
      title,
      done,
      due: normalizeDue(raw.due),
      priority: normalizePriority(raw.priority),
      createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : 0,
      completedAt: done && Number.isFinite(raw.completedAt) ? raw.completedAt : null,
    };
  }

  /** 保存データを読み込む。壊れた・不正な項目は捨て、例外は投げない。 */
  function deserialize(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return [];
    }
    const list = Array.isArray(data) ? data : data && Array.isArray(data.todos) ? data.todos : [];
    const seen = new Set();
    const todos = [];
    for (const raw of list) {
      const todo = sanitizeTodo(raw);
      if (!todo) continue;
      if (seen.has(todo.id)) todo.id = generateId();
      seen.add(todo.id);
      todos.push(todo);
    }
    return todos;
  }

  return {
    PRIORITIES,
    FILTERS,
    SORTS,
    MAX_TITLE_LENGTH,
    createTodo,
    addTodo,
    updateTodo,
    toggleTodo,
    setAllDone,
    removeTodo,
    clearCompleted,
    toDateString,
    daysUntil,
    isOverdue,
    visibleTodos,
    getStats,
    serialize,
    deserialize,
  };
});
