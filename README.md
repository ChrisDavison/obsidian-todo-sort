# Obsidian Todo Sort

An Obsidian plugin with two commands: **`Todo: Sort completed tasks to bottom`**
and **`Todo: Sort by due date`**.

It reorders the todo list at the level your cursor is on, or at the shallowest
list level touched by your selection. Completed tasks sink to the bottom and
everything else keeps its order.

`Todo: Sort by due date` orders incomplete tasks soonest first using `📅`
due dates, falling back to `⏳` scheduled dates. Undated incomplete tasks follow
dated ones. Completed tasks move to the bottom using the completed-task sorting
rules described below. Overdue tasks are not specially grouped or highlighted.
You can optionally limit sorting to dates within a number of days from today.

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
- Tasks inside blockquotes and callouts are supported. Quote-depth changes,
  quoted titles, paragraphs, and fenced code bound the list being sorted.
- The cursor follows its task after a sort. With a selection, it moves to the
  first selected task. A single undo reverses the sort.

These are the defaults. Settings → Todo can adjust the rules below without
changing any of the above until you touch a setting.

## Settings

- **Cancelled counts as completed** (on): `[-]` tasks are completed and sink
  below done tasks. Off: `[-]` counts as incomplete and stays on top.
- **Tab width** (4): how many columns a tab character counts for when measuring
  list indentation. Matters when lists mix tabs and spaces.
- **Undated completed tasks** (bottom of the completed group): completed tasks
  without a date follow the dated ones. Top: they come first.
- **Sortable date range (days)** (blank): blank sorts all dates as before. Set a
  whole number of days (0-365000) to sort incomplete tasks dated on or before
  today plus that many calendar days, including overdue dates. For example,
  with 60 days set on January 1, January and February dates are sortable, but
  June dates are not. A due date beyond the range falls back to a scheduled
  date within the range. Tasks with neither date in range join undated tasks
  after dated tasks, preserving their relative order. This setting only affects
  **Sort by due date**, not **Sort completed tasks to bottom**. The command's
  notice counts tasks excluded from date sorting because every date they have
  is beyond the range, even when nothing changes in the note. Tasks
  using an in-range scheduled-date fallback are not counted.

## Usage

1. Download `main.js` and `manifest.json` from the desired [GitHub release](https://github.com/ChrisDavison/obsidian-todo-sort/releases).
2. Put both files in `<vault>/.obsidian/plugins/todo-sort-completed/`. The folder
   name must match the plugin ID in `manifest.json`.
3. Enable **Todo Sort** in Settings → Community plugins.
4. Run `Todo: Sort completed tasks to bottom` from the command palette, or bind
   a hotkey to it. Run `Todo: Sort by due date` to order incomplete tasks by
   their due or scheduled date.

There is no build step and no dependencies. `main.js` is the complete source.

## Scope

Not handled: ordered lists and multiple cursors. Those are reported rather than
edited.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for the
full license text.
