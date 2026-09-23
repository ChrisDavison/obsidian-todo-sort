const { Plugin, Notice } = require("obsidian");

/*
 * Todo: Sort completed tasks to bottom
 *
 * Sorts one list level only. Whole subtrees move together and children keep
 * their order. A completed task is `[x]`/`[X]` (done) or `[-]` (cancelled);
 * cancelled items sink below done items, and both are ordered newest first by
 * their ✅/❌ date, with undated items last. Anything else at the sorted level
 * (including plain bullets, [/], [>]) is treated as incomplete and stays on top.
 *
 * Without a selection the level is the cursor item's own level. With a
 * selection the level is the shallowest list level present, and every affected
 * parent's complete child list is sorted.
 *
 * Plain JavaScript on purpose: no build step, no dependencies.
 */

const TAB_WIDTH = 4;

// Checkbox marker: [-], [ ], [x], [X]. Tested before the plain-bullet pattern.
const CHECKBOX_RE = /^([ \t]*)([-*+])([ \t]+)\[([ xX-])\](?=[ \t]|$)/;
// Any other bullet, including ones with no content.
const BULLET_RE = /^([ \t]*)([-*+])(?=[ \t]|$)/;
const DONE_DATE_RE = /✅\s*(\d{4}-\d{2}-\d{2})/;
const CANCEL_DATE_RE = /❌\s*(\d{4}-\d{2}-\d{2})/;
const FENCE_RE = /^[ \t]*(```|~~~)/;

function indentWidth(whitespace) {
  let width = 0;
  for (const ch of whitespace) {
    width += ch === "\t" ? TAB_WIDTH - (width % TAB_WIDTH) : 1;
  }
  return width;
}

function leadingWhitespace(line) {
  const match = /^[ \t]*/.exec(line);
  return match ? match[0] : "";
}

function isBlank(line) {
  return /^[ \t]*$/.test(line);
}

function parseLines(lines) {
  const parsed = [];
  let inFence = false;

  for (const line of lines) {
    const indent = indentWidth(leadingWhitespace(line));

    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      parsed.push({ kind: "none", indent, status: null, doneDate: null, cancelDate: null });
      continue;
    }

    if (inFence) {
      parsed.push({ kind: "none", indent, status: null, doneDate: null, cancelDate: null });
      continue;
    }

    const checkbox = CHECKBOX_RE.exec(line);
    if (checkbox) {
      const symbol = checkbox[4];
      parsed.push({
        kind: "checkbox",
        indent: indentWidth(checkbox[1]),
        status: symbol === "x" || symbol === "X" ? "done" : symbol === "-" ? "cancelled" : "incomplete",
        doneDate: (DONE_DATE_RE.exec(line) || [])[1] || null,
        cancelDate: (CANCEL_DATE_RE.exec(line) || [])[1] || null,
      });
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      parsed.push({
        kind: "bullet",
        indent: indentWidth(bullet[1]),
        status: "incomplete",
        doneDate: null,
        cancelDate: null,
      });
      continue;
    }

    parsed.push({ kind: "none", indent, status: null, doneDate: null, cancelDate: null });
  }

  return parsed;
}

// Nearest item above with a shallower indent, or null when the item is top level.
// Stops at an unindented non-list line (heading, paragraph, rule) or two blank lines.
function findParent(parsed, lines, index, width) {
  let blanks = 0;

  for (let i = index - 1; i >= 0; i--) {
    if (isBlank(lines[i])) {
      if (blanks >= 1) return null;
      blanks += 1;
      continue;
    }
    blanks = 0;

    const line = parsed[i];
    if (line.kind === "none") {
      if (line.indent === 0) return null;
      continue;
    }
    if (line.indent < width) return i;
  }

  return null;
}

// Direct children at `width` of the item at parentIndex, plus the end of its scope.
function collectChildren(parsed, lines, parentIndex, width) {
  const starts = [];
  const parentIndent = parsed[parentIndex].indent;
  let end = parentIndex + 1;
  let blanks = 0;

  for (let i = parentIndex + 1; i < parsed.length; i++) {
    if (isBlank(lines[i])) {
      if (blanks >= 1) break;
      blanks += 1;
      end = i + 1;
      continue;
    }
    blanks = 0;

    const line = parsed[i];
    if (line.kind === "none") {
      if (line.indent === 0) break;
      end = i + 1;
      continue;
    }
    if (line.indent <= parentIndent) break;
    if (line.indent === width) starts.push(i);
    end = i + 1;
  }

  return { starts, end };
}

// Top-level run containing `index`, bounded by shallower items and unindented non-list lines.
function collectRootGroup(parsed, lines, index, width) {
  let start = index;
  let blanks = 0;

  for (let i = index - 1; i >= 0; i--) {
    if (isBlank(lines[i])) {
      if (blanks >= 1) break;
      blanks += 1;
      start = i;
      continue;
    }
    blanks = 0;

    const line = parsed[i];
    if (line.kind === "none") {
      if (line.indent === 0) break;
      start = i;
      continue;
    }
    if (line.indent < width) break;
    start = i;
  }

  let end = index + 1;
  blanks = 0;

  for (let i = index + 1; i < parsed.length; i++) {
    if (isBlank(lines[i])) {
      if (blanks >= 1) break;
      blanks += 1;
      end = i + 1;
      continue;
    }
    blanks = 0;

    const line = parsed[i];
    if (line.kind === "none") {
      if (line.indent === 0) break;
      end = i + 1;
      continue;
    }
    if (line.indent < width) break;
    end = i + 1;
  }

  const starts = [];
  for (let i = start; i < end; i++) {
    if (parsed[i].kind !== "none" && parsed[i].indent === width) starts.push(i);
  }

  return { starts, end, start };
}

function resolveGroup(parsed, lines, index, width) {
  const parent = findParent(parsed, lines, index, width);
  if (parent === null) {
    const group = collectRootGroup(parsed, lines, index, width);
    return { key: "root@" + group.start, starts: group.starts, end: group.end };
  }
  const group = collectChildren(parsed, lines, parent, width);
  return { key: "parent@" + parent, starts: group.starts, end: group.end };
}

function tierOf(item) {
  if (item.status === "done") return 1;
  if (item.status === "cancelled") return 2;
  return 0;
}

// Incomplete in original order, then done newest first, then cancelled newest first.
// Undated completed items come after dated ones. Ordering is stable.
function sortOrder(parsed, starts) {
  const entries = starts.map((line, position) => ({ position, item: parsed[line] }));

  entries.sort((a, b) => {
    const tierA = tierOf(a.item);
    const tierB = tierOf(b.item);
    if (tierA !== tierB) return tierA - tierB;
    if (tierA === 0) return a.position - b.position;

    const dateA = tierA === 1 ? a.item.doneDate : a.item.cancelDate;
    const dateB = tierB === 1 ? b.item.doneDate : b.item.cancelDate;
    if (dateA && dateB) return dateA === dateB ? a.position - b.position : (dateB < dateA ? -1 : 1);
    if (dateA) return -1;
    if (dateB) return 1;
    return a.position - b.position;
  });

  return entries.map((entry) => entry.position);
}

function applyGroup(lines, parsed, group) {
  const { starts, end } = group;
  if (starts.length < 2) return null;

  const spans = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i];
    const to = i + 1 < starts.length ? starts[i + 1] : end;
    spans.push(lines.slice(from, to));
  }

  // Blank lines are separators: keep them at their positions instead of moving
  // them with a subtree.
  const cores = [];
  const gaps = [];
  for (const span of spans) {
    let length = span.length;
    while (length > 0 && isBlank(span[length - 1])) length -= 1;
    cores.push(span.slice(0, length));
    gaps.push(span.slice(length));
  }

  const order = sortOrder(parsed, starts);
  const unchanged = order.every((value, position) => value === position);
  if (unchanged) return null;

  const text = [];
  for (let position = 0; position < order.length; position++) {
    text.push(...cores[order[position]]);
    text.push(...gaps[position]);
  }

  return {
    starts,
    order,
    cores,
    gaps,
    regionStart: starts[0],
    regionEnd: end,
    text,
    moved: starts.filter((line) => tierOf(parsed[line]) > 0).length,
  };
}

function movedLineNumber(result, anchor) {
  const position = result.starts.indexOf(anchor);
  if (position < 0) return null;
  const newPosition = result.order.indexOf(position);
  let line = result.regionStart;
  for (let i = 0; i < newPosition; i++) {
    line += result.cores[result.order[i]].length + result.gaps[i].length;
  }
  return line;
}

class TodoSortCompletedPlugin extends Plugin {
  onload() {
    this.addCommand({
      id: "sort-completed-to-bottom",
      name: "Sort completed tasks to bottom",
      editorCheckCallback: (checking, editor, ctx) => {
        if (!editor) return false;
        // Reading (preview) mode has no editor to sort; only act in source/live preview.
        if (ctx && typeof ctx.getMode === "function" && ctx.getMode() !== "source") return false;
        if (!checking) this.sortCompletedToBottom(editor);
        return true;
      },
    });
  }

  sortCompletedToBottom(editor) {
    const lines = editor.getValue().split("\n");
    const parsed = parseLines(lines);
    const cursor = editor.getCursor();
    const selections = editor.listSelections();

    if (selections.length > 1) {
      new Notice("Todo: multiple selections are not supported.");
      return;
    }

    // Obsidian selections are CodeMirror-style { anchor, head }.
    const selection = selections[0] || { anchor: cursor, head: cursor };
    const hasSelection =
      selection.anchor.line !== selection.head.line || selection.anchor.ch !== selection.head.ch;

    let width;
    let anchors;

    if (hasSelection) {
      const startLine = Math.min(selection.anchor.line, selection.head.line);
      const endLine = Math.max(selection.anchor.line, selection.head.line);
      const widths = [];
      for (let i = startLine; i <= endLine; i++) {
        if (parsed[i].kind !== "none") widths.push(parsed[i].indent);
      }
      if (!widths.length) {
        new Notice("Todo: nothing to sort.");
        return;
      }
      width = Math.min(...widths);
      anchors = [];
      for (let i = startLine; i <= endLine; i++) {
        if (parsed[i].kind !== "none" && parsed[i].indent === width) anchors.push(i);
      }
    } else {
      let anchor = cursor.line;
      while (anchor >= 0 && parsed[anchor].kind === "none") {
        if (!isBlank(lines[anchor]) && parsed[anchor].indent === 0) {
          new Notice("Todo: cursor is not in a list.");
          return;
        }
        anchor -= 1;
      }
      if (anchor < 0) {
        new Notice("Todo: cursor is not in a list.");
        return;
      }
      width = parsed[anchor].indent;
      anchors = [anchor];
    }

    const groups = new Map();
    for (const anchor of anchors) {
      const group = resolveGroup(parsed, lines, anchor, width);
      if (!groups.has(group.key)) groups.set(group.key, group);
    }

    const results = [];
    let movedTotal = 0;
    for (const group of groups.values()) {
      const result = applyGroup(lines, parsed, group);
      if (result) {
        results.push(result);
        movedTotal += result.moved;
      }
    }

    if (!results.length) {
      new Notice("Todo: nothing to sort.");
      return;
    }

    results.sort((a, b) => a.regionStart - b.regionStart);
    const start = results[0].regionStart;
    const end = results[results.length - 1].regionEnd;
    const replacement = [];
    let index = start;
    let nextResult = 0;

    while (index < end) {
      const result = results[nextResult];
      if (result && result.regionStart === index) {
        replacement.push(...result.text);
        index = result.regionEnd;
        nextResult += 1;
      } else {
        replacement.push(lines[index]);
        index += 1;
      }
    }

    editor.transaction({
      changes: [
        {
          from: { line: start, ch: 0 },
          to: { line: end - 1, ch: lines[end - 1].length },
          text: replacement.join("\n"),
        },
      ],
    });

    if (!hasSelection && results.length === 1) {
      const newLine = movedLineNumber(results[0], anchors[0]);
      if (newLine !== null) editor.setCursor({ line: newLine, ch: cursor.ch });
    }

    new Notice(
      "Todo: moved " + movedTotal + " completed task" + (movedTotal === 1 ? "" : "s") + " to the bottom."
    );
  }
}

module.exports = TodoSortCompletedPlugin;
