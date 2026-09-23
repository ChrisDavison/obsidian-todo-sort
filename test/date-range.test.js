const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

function pluginWithSettings(saved) {
  const settings = [];
  const notices = [];
  class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [2026, 0, 1, 12]));
    }
  }
  class Plugin {
    async loadData() { return saved; }
    async saveData(data) { this.saved = { ...data }; }
    addSettingTab(tab) { this.settingTab = tab; }
    addCommand() {}
  }
  class Setting {
    constructor() { settings.push(this); }
    setName(name) { this.name = name; return this; }
    setDesc() { return this; }
    addText(callback) { this.addControl(callback); return this; }
    addToggle(callback) { this.addControl(callback); return this; }
    addDropdown(callback) { this.addControl(callback); return this; }
    addControl(callback) {
      const control = {
        addOption() { return this; },
        setPlaceholder() { return this; },
        setValue(value) { this.value = value; return this; },
        onChange(handler) { this.change = handler; return this; },
      };
      this.control = control;
      callback(control);
    }
  }
  const context = {
    Date: FixedDate,
    module: { exports: {} },
    require: () => ({
      Plugin,
      PluginSettingTab: class { constructor() { this.containerEl = { empty() {} }; } },
      Setting,
      Notice: class { constructor(message) { notices.push(message); } },
    }),
  };
  vm.runInNewContext(source, context, { filename: "main.js" });
  const plugin = new context.module.exports();
  plugin.settingControls = settings;
  plugin.notices = notices;
  return plugin;
}

function sort(plugin, input, mode = "due-date", selection = null) {
  let value = input;
  plugin.notices.length = 0;
  const editor = {
    getValue: () => value,
    getCursor: () => ({ line: 0, ch: 0 }),
    listSelections: () => selection ? [selection] : [],
    transaction: ({ changes }) => {
      const { from, to, text } = changes[0];
      const lines = value.split("\n");
      lines.splice(from.line, to.line - from.line + 1, ...text.split("\n"));
      value = lines.join("\n");
    },
    setCursor: () => {},
  };
  plugin.sortTasks(editor, mode);
  return value;
}

test("60-day range includes its last day and overdue dates, falls back to scheduled, and groups later dates with undated tasks", async () => {
  const plugin = pluginWithSettings({ sortableDateRangeDays: 60 });
  await plugin.onload();
  const input = [
    "- [ ] June 📅 2026-06-01",
    "- [ ] Undated",
    "- [ ] February 📅 2026-02-28",
    "- [ ] Boundary 📅 2026-03-02",
    "- [ ] Beyond boundary 📅 2026-03-03",
    "- [ ] Scheduled ⏳ 2026-02-01",
    "- [ ] Due later, scheduled now 📅 2026-06-01 ⏳ 2026-01-01",
    "- [ ] Overdue 📅 2020-01-01",
    "- [x] Done ✅ 2025-12-31",
    "- [ ] Due wins 📅 2026-02-15 ⏳ 2026-01-01",
  ];
  assert.equal(sort(plugin, input.join("\n")), [
    input[7], input[6], input[5], input[9], input[2], input[3],
    input[0], input[1], input[4], input[8],
  ].join("\n"));
  assert.equal(plugin.notices.at(-1),
    "Todo: sorted tasks by due date; completed tasks moved to the bottom. " +
    "2 tasks skipped from date sorting (outside date range).");
});

test("blank range preserves unlimited sorting; zero includes today but not tomorrow", async () => {
  const input = [
    "- [ ] June 📅 2026-06-01",
    "- [ ] Tomorrow 📅 2026-01-02",
    "- [ ] Today 📅 2026-01-01",
    "- [ ] No date",
  ];
  const unlimited = pluginWithSettings({ sortableDateRangeDays: "" });
  await unlimited.onload();
  assert.equal(sort(unlimited, input.join("\n")), [input[2], input[1], input[0], input[3]].join("\n"));
  assert.equal(unlimited.notices.at(-1), "Todo: sorted tasks by due date; completed tasks moved to the bottom.");

  const zero = pluginWithSettings({ sortableDateRangeDays: 0 });
  await zero.onload();
  assert.equal(sort(zero, input.join("\n")), [input[2], input[0], input[1], input[3]].join("\n"));
  assert.match(zero.notices.at(-1), /2 tasks skipped from date sorting/);
});

test("reports skipped tasks when no edit is needed and counts only the sorted level", async () => {
  const plugin = pluginWithSettings({ sortableDateRangeDays: 60 });
  await plugin.onload();
  const input = "- [ ] June 📅 2026-06-01\n  - [ ] Nested July 📅 2026-07-01\n- [ ] Undated\n- [ ] March 📅 2026-03-03";
  assert.equal(sort(plugin, input), input);
  assert.equal(plugin.notices.at(-1),
    "Todo: nothing to sort. 2 tasks skipped from date sorting (outside date range).");
});

test("reports a single scheduled-only task beyond the range", async () => {
  const plugin = pluginWithSettings({ sortableDateRangeDays: 60 });
  await plugin.onload();
  const input = "- [ ] Scheduled June ⏳ 2026-06-01";
  assert.equal(sort(plugin, input), input);
  assert.equal(plugin.notices.at(-1),
    "Todo: nothing to sort. 1 task skipped from date sorting (outside date range).");
});

test("counts skipped tasks across separate selected list groups", async () => {
  const plugin = pluginWithSettings({ sortableDateRangeDays: 60 });
  await plugin.onload();
  const input = [
    "- [ ] June 📅 2026-06-01",
    "- [ ] January 📅 2026-01-02",
    "# Another list",
    "- [ ] April 📅 2026-04-01",
    "- [ ] February 📅 2026-02-01",
  ];
  const selection = { anchor: { line: 0, ch: 0 }, head: { line: 4, ch: 10 } };
  assert.equal(sort(plugin, input.join("\n"), "due-date", selection), [
    input[1], input[0], input[2], input[4], input[3],
  ].join("\n"));
  assert.match(plugin.notices.at(-1), /2 tasks skipped from date sorting/);
});

test("invalid saved ranges fall back to unlimited sorting", async () => {
  for (const range of [-1, "1.5", "60days", 365001]) {
    const plugin = pluginWithSettings({ sortableDateRangeDays: range });
    await plugin.onload();
    assert.equal(plugin.settings.sortableDateRangeDays, null);
  }
});

test("setting saves a day count, clears to unlimited, and rejects invalid input", async () => {
  const plugin = pluginWithSettings(null);
  await plugin.onload();
  plugin.settingTab.display();
  const field = plugin.settingControls.find((setting) => setting.name === "Sortable date range (days)").control;
  assert.equal(field.value, "");
  await field.change("60");
  assert.equal(plugin.saved.sortableDateRangeDays, 60);
  await field.change("-1");
  assert.equal(field.value, "60");
  assert.equal(plugin.saved.sortableDateRangeDays, 60);
  await field.change("");
  assert.equal(plugin.saved.sortableDateRangeDays, null);
});

test("date range does not change completed-task sorting", async () => {
  const plugin = pluginWithSettings({ sortableDateRangeDays: 0 });
  await plugin.onload();
  const input = "- [x] Done\n- [ ] June 📅 2026-06-01\n- [ ] Today 📅 2026-01-01";
  assert.equal(sort(plugin, input, "completed"), "- [ ] June 📅 2026-06-01\n- [ ] Today 📅 2026-01-01\n- [x] Done");
  assert.equal(plugin.notices.at(-1), "Todo: moved 1 completed task to the bottom.");
});
