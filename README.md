# Obsidian Todo Sort

An Obsidian plugin with one command: **`Todo: Sort completed tasks to bottom`**.

It reorders the todo list at the level your cursor is on, or at the shallowest
list level touched by your selection. Completed tasks sink to the bottom and
everything else keeps its order.

## Behaviour

- A completed task is `[x]` / `[X]` (done) or `[-]` (cancelled).
- Done tasks come first in the completed group, cancelled tasks after them.
- Within each completed group, tasks are ordered newest first by their done
  (`✅ YYYY-MM-DD`) or cancelled (`❌ YYYY-MM-DD`) date. Tasks without a date
  follow the dated ones, in their original order.
- Everything else at the sorted level counts as incomplete and stays on top.
  This includes `[ ]`, `[/]`, other status symbols, and plain bullets.
- Children and annotation lines move with their parent and keep their order.
- No selection: the cursor item's own level. With a selection: the shallowest
  list level present, and every affected parent's full child list is sorted.
- One blank line keeps a list together; two consecutive blank lines break it.
- The cursor follows the task it was on, and a single undo reverses the sort.

## Usage

1. Put this folder in `<vault>/.obsidian/plugins/obsidian-todo-sort/`.
2. Enable **Todo Sort** in Settings → Community plugins.
3. Run `Todo: Sort completed tasks to bottom` from the command palette, or bind
   a hotkey to it.

There is no build step and no dependencies. `main.js` is the complete source.

## Scope

Not handled: tasks inside callouts or blockquotes, ordered lists, and multiple
cursors. Those are reported rather than edited.
