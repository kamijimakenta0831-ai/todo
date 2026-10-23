const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../todo-core.js');

function make(titles) {
  return titles.reduce((todos, title, i) => Core.addTodo(todos, title, { now: i }), []);
}

test('addTodo はタイトルを整形して末尾に追加する', () => {
  const todos = Core.addTodo([], '  牛乳を   買う ', { due: '2026-10-30', priority: 'high', now: 5 });
  assert.equal(todos.length, 1);
  assert.equal(todos[0].title, '牛乳を 買う');
  assert.equal(todos[0].due, '2026-10-30');
  assert.equal(todos[0].priority, 'high');
  assert.equal(todos[0].createdAt, 5);
  assert.equal(todos[0].done, false);
});

test('addTodo は空タイトルなら元の配列をそのまま返す', () => {
  const todos = make(['a']);
  assert.equal(Core.addTodo(todos, '   '), todos);
});

test('不正な期限・優先度は既定値になる', () => {
  const [todo] = Core.addTodo([], 'x', { due: '2026-02-30', priority: 'urgent' });
  assert.equal(todo.due, null);
  assert.equal(todo.priority, 'medium');
});

test('toggleTodo は完了状態と完了日時を切り替え、元の配列は変えない', () => {
  const todos = make(['a', 'b']);
  const done = Core.toggleTodo(todos, todos[0].id, 100);
  assert.equal(done[0].done, true);
  assert.equal(done[0].completedAt, 100);
  assert.equal(done[1], todos[1]);
  assert.equal(todos[0].done, false);

  const undone = Core.toggleTodo(done, todos[0].id, 200);
  assert.equal(undone[0].done, false);
  assert.equal(undone[0].completedAt, null);
});

test('updateTodo は空のタイトルを無視し、期限を消せる', () => {
  let todos = Core.addTodo([], 'a', { due: '2026-10-30' });
  const id = todos[0].id;
  todos = Core.updateTodo(todos, id, { title: '  ', due: '', priority: 'low' });
  assert.equal(todos[0].title, 'a');
  assert.equal(todos[0].due, null);
  assert.equal(todos[0].priority, 'low');
});

test('setAllDone / clearCompleted / removeTodo', () => {
  const todos = make(['a', 'b', 'c']);
  const all = Core.setAllDone(todos, true, 1);
  assert.ok(all.every((t) => t.done));
  assert.equal(Core.clearCompleted(all).length, 0);

  const partial = Core.toggleTodo(todos, todos[1].id);
  assert.deepEqual(Core.clearCompleted(partial).map((t) => t.title), ['a', 'c']);
  assert.deepEqual(Core.removeTodo(todos, todos[0].id).map((t) => t.title), ['b', 'c']);
});

test('visibleTodos は絞り込みと検索を組み合わせる', () => {
  let todos = make(['Buy milk', 'Write report', 'buy eggs']);
  todos = Core.toggleTodo(todos, todos[2].id);
  const titles = (opts) => Core.visibleTodos(todos, opts).map((t) => t.title);

  assert.deepEqual(titles({ filter: 'active' }), ['Buy milk', 'Write report']);
  assert.deepEqual(titles({ filter: 'completed' }), ['buy eggs']);
  assert.deepEqual(titles({ query: ' BUY ' }), ['Buy milk', 'buy eggs']);
  assert.deepEqual(titles({ filter: 'active', query: 'buy' }), ['Buy milk']);
});

test('visibleTodos の期限順は期限なしを最後にし、同じ期限は追加順を保つ', () => {
  const todos = [
    ['none', null],
    ['late', '2026-12-01'],
    ['early-1', '2026-11-01'],
    ['early-2', '2026-11-01'],
  ].reduce((acc, [title, due]) => Core.addTodo(acc, title, { due }), []);
  assert.deepEqual(
    Core.visibleTodos(todos, { sort: 'due' }).map((t) => t.title),
    ['early-1', 'early-2', 'late', 'none'],
  );
  assert.deepEqual(todos.map((t) => t.title), ['none', 'late', 'early-1', 'early-2']);
});

test('visibleTodos の優先度順', () => {
  const todos = [['l', 'low'], ['h', 'high'], ['m', 'medium'], ['h2', 'high']]
    .reduce((acc, [title, priority]) => Core.addTodo(acc, title, { priority }), []);
  assert.deepEqual(
    Core.visibleTodos(todos, { sort: 'priority' }).map((t) => t.title),
    ['h', 'h2', 'm', 'l'],
  );
});

test('日付ユーティリティと期限切れ判定', () => {
  assert.equal(Core.toDateString(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(Core.daysUntil('2026-10-25', '2026-10-23'), 2);
  assert.equal(Core.daysUntil('2026-10-20', '2026-10-23'), -3);
  assert.equal(Core.daysUntil('2027-01-01', '2026-12-31'), 1);

  const [todo] = Core.addTodo([], 'x', { due: '2026-10-22' });
  assert.equal(Core.isOverdue(todo, '2026-10-23'), true);
  assert.equal(Core.isOverdue(todo, '2026-10-22'), false);
  assert.equal(Core.isOverdue({ ...todo, done: true }, '2026-10-23'), false);
});

test('getStats', () => {
  let todos = [['a', '2026-10-01'], ['b', '2026-10-01'], ['c', null]]
    .reduce((acc, [title, due]) => Core.addTodo(acc, title, { due }), []);
  todos = Core.toggleTodo(todos, todos[0].id);
  assert.deepEqual(Core.getStats(todos, '2026-10-23'), { total: 3, done: 1, active: 2, overdue: 1 });
});

test('serialize / deserialize は往復できる', () => {
  const base = Core.addTodo(make(['a']), 'b', { due: '2026-11-01', priority: 'low' });
  const todos = Core.toggleTodo(base, base[0].id, 9);
  assert.deepEqual(Core.deserialize(Core.serialize(todos)), todos);
});

test('deserialize は壊れたデータでも例外を投げない', () => {
  assert.deepEqual(Core.deserialize(null), []);
  assert.deepEqual(Core.deserialize('not json'), []);
  assert.deepEqual(Core.deserialize('{"todos": 1}'), []);

  const todos = Core.deserialize(JSON.stringify([
    null,
    { title: '' },
    { id: 'x', title: 'ok', done: 'yes', due: 'tomorrow', priority: 'high', completedAt: 5 },
    { id: 'x', title: 'dup' },
  ]));
  assert.equal(todos.length, 2);
  assert.deepEqual(todos[0], {
    id: 'x', title: 'ok', done: false, due: null, priority: 'high', createdAt: 0, completedAt: null,
  });
  assert.notEqual(todos[1].id, 'x');
});
