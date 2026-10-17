// @vitest-environment happy-dom
import { act, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { EditorAdapter, pageSnapshot } from "../../../packages/plugin/src/admin/puck-adapter.tsx";
import { EditorProof } from "../../../packages/plugin/src/admin/editor-proof.tsx";
import { components as siteComponents } from "../../../packages/components/src/registry.ts";
import { proofComponents, proofPage, proofPresets } from "./editor-proof-data.mjs";

// Pin the real Puck 0.23 history boundary without spending wall-clock time.
const historyDebounceMs = 250;
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
const settleHistory = () => act(async () => vi.advanceTimersByTimeAsync(historyDebounceMs));

test("pinned Puck accepts only validated candidates, and owns undo and redo", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  let editor;
  try {
    await act(async () =>
      root.render(
        createElement(EditorAdapter, {
          initialPage: { content: proofPage.content, root: proofPage.root, formatVersion: 1 },
          components: proofComponents,
          tokens: {},
          children: (state) => {
            editor = state;
            return createElement(Fragment, null, state.outline, state.fields);
          },
        }),
      ),
    );
    expect(editor.page).toEqual(proofPage);
    expect(pageSnapshot(editor.page)).toBe(pageSnapshot(proofPage));
    expect(editor.canUndo).toBe(false);
    await act(async () => editor.commit(structuredClone(proofPage)));
    await settleHistory();
    expect(editor.canUndo).toBe(false);
    // Native JSON round trips can reorder keys without changing the Page.
    const baseline = JSON.stringify(proofPage);
    await act(async () => editor.select("child"));
    expect(editor.selected).toBe("child");
    expect(editor.canUndo).toBe(false);
    const title = element.querySelector('input[id="child:title"]');
    await act(async () => title.focus());
    const type = async (input, value) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    for (const value of ["", "C", "Ch", "Chrome verified edit"]) await type(title, value);
    expect(title.value).toBe("Chrome verified edit");
    expect(title.getAttribute("aria-labelledby")).toBe("child:title:label");
    expect(editor.page.content[0].props.left[0].props.title).toBe("Chrome verified edit");
    await act(async () => editor.select("parent"));
    await act(async () => editor.select("child"));
    expect(element.querySelector('input[id="child:title"]').value).toBe("Chrome verified edit");
    await settleHistory();
    await act(async () => editor.undo());
    expect(editor.page).toEqual(JSON.parse(baseline));
    expect(pageSnapshot(editor.page)).toBe(pageSnapshot(proofPage));
    await act(async () => editor.select("child"));
    expect(element.querySelector('input[id="child:title"]').value).toBe("Nested Block");
    const count = element.querySelector('input[id="child:count"]');
    expect(count).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
        count,
        "invalid number",
      );
      count.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(editor.invalidDrafts).toBe(true);
    expect(editor.page).toEqual(proofPage);
    expect(count.value).toBe("invalid number");
    expect(count.getAttribute("aria-invalid")).toBe("false");
    await act(async () => editor.showDraftErrors());
    expect(count.getAttribute("aria-invalid")).toBe("true");
    await act(async () => editor.select("parent"));
    await act(async () => editor.select("child"));
    const retained = element.querySelector('input[id="child:count"]');
    expect(retained.value).toBe("invalid number");
    await act(async () => {
      retained.focus();
      editor.undo();
    });
    expect(editor.invalidDrafts).toBe(false);
    expect(editor.page).toEqual(proofPage);
    expect(editor.canUndo).toBe(false);
    const invalid = structuredClone(editor.page);
    invalid.content[0].props.left[0].props.count = "invalid";
    await act(async () => {
      expect(editor.commit(invalid)).toBe(false);
    });
    expect(editor.page).toEqual(proofPage);
    expect(editor.canUndo).toBe(false);
    const valid = structuredClone(editor.page);
    valid.content[0].props.left[0].props.count = 2;
    await act(async () => {
      expect(editor.commit(valid)).toBe(true);
    });
    // Puck 0.23 groups accepted commits with a 250ms history debounce.
    expect(editor.canUndo).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(historyDebounceMs - 1));
    expect(editor.canUndo).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(editor.page).toEqual(valid);
    expect(editor.canUndo).toBe(true);
    await act(async () => editor.undo());
    expect(editor.page).toEqual(proofPage);
    await act(async () => editor.redo());
    expect(editor.page).toEqual(valid);
    expect(element.querySelector("iframe")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    element.remove();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  }
});

test("Puck round trip preserves root title and canonical key-order identity", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  const page = {
    content: proofPage.content,
    root: { props: { title: "Root title" } },
    formatVersion: 1,
  };
  let editor;
  try {
    await act(async () =>
      root.render(
        createElement(EditorAdapter, {
          initialPage: page,
          components: proofComponents,
          tokens: {},
          children: (state) => {
            editor = state;
            return null;
          },
        }),
      ),
    );
    expect(editor.page).toEqual(page);
    expect(pageSnapshot(editor.page)).toBe(pageSnapshot(page));
    expect(editor.page.root.props).toEqual({ title: "Root title" });
    expect(editor.canUndo).toBe(false);
  } finally {
    await act(async () => root.unmount());
    element.remove();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  }
});

// Structural tests mount the real pinned Puck provider and its actual Fields.
async function withEditor(options, run) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  let editor;
  let visible = true;
  let nextId = 0;
  const render = () =>
    root.render(
      createElement(EditorAdapter, {
        initialPage: proofPage,
        components: proofComponents,
        tokens: {},
        presets: proofPresets,
        generateId: () => `new-${++nextId}`,
        ...options,
        children: (state) => {
          editor = state;
          return visible
            ? createElement(Fragment, null, state.outline, state.rootControls, state.fields)
            : null;
        },
      }),
    );
  const click = async (name) => {
    const button = [...element.querySelectorAll("button")].find(
      (item) => (item.getAttribute("aria-label") ?? item.textContent) === name,
    );
    expect(button, name).toBeTruthy();
    await act(async () => button.click());
  };
  try {
    await act(async () => render());
    await run({
      get editor() {
        return editor;
      },
      element,
      click,
      panels: async (show) => {
        visible = show;
        await act(async () => render());
      },
    });
  } finally {
    await settleHistory();
    await act(async () => root.unmount());
    element.remove();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  }
}
const typeInput = async (element, id, value) =>
  act(async () => {
    const input = element.querySelector(`input[id="${id}"]`);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

// Puck tracks physical codes and held modifiers, not key alone.
async function shortcut(target, key, { meta = false, shift = false, alt = false } = {}) {
  const modifier = alt
    ? ["Alt", "AltLeft"]
    : meta
      ? ["Meta", "MetaLeft"]
      : ["Control", "ControlLeft"];
  const flags = { ctrlKey: !meta && !alt, metaKey: meta, altKey: alt, shiftKey: shift };
  const dispatch = (type, key, code) => {
    const event = new KeyboardEvent(type, { key, code, ...flags, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };
  let handled;
  await act(async () => {
    dispatch("keydown", ...modifier);
    if (shift) dispatch("keydown", "Shift", "ShiftLeft");
    handled = dispatch("keydown", key, `Key${key.toUpperCase()}`).defaultPrevented;
    dispatch("keyup", key, `Key${key.toUpperCase()}`);
    if (shift) dispatch("keyup", "Shift", "ShiftLeft");
    dispatch("keyup", ...modifier);
  });
  await act(async () => vi.advanceTimersToNextFrame());
  return handled;
}

test("physical history shortcuts discard focused invalid input once, then travel one validated snapshot", async () => {
  for (const meta of [false, true]) {
    await withEditor({}, async (view) => {
      await act(async () => view.editor.select("child"));
      await typeInput(view.element, "child:title", "First accepted title");
      await settleHistory();
      await typeInput(view.element, "child:title", "Second accepted title");
      await settleHistory();
      await typeInput(view.element, "child:count", "invalid count");
      const count = view.element.querySelector('input[id="child:count"]');
      await act(async () => count.focus());
      const accepted = structuredClone(view.editor.page);
      expect(await shortcut(count, "z", { meta })).toBe(true);
      expect(count.value).toBe("1");
      expect(view.editor.page).toEqual(accepted);
      expect(view.editor.canRedo).toBe(false);
      await shortcut(count, "z", { meta });
      expect(view.editor.page.content[0].props.left[0].props.title).toBe("First accepted title");
      await shortcut(count, "z", { meta, shift: true });
      expect(view.editor.page).toEqual(accepted);
      await shortcut(count, "z", { meta });
      await shortcut(count, "y", { meta });
      expect(view.editor.page).toEqual(accepted);
    });
  }
});

test("physical undo and both redo bindings revalidate history against current Design System", async () => {
  const components = structuredClone(proofComponents);
  await withEditor({ components }, async (view) => {
    await act(async () => view.editor.select("child"));
    const candidate = structuredClone(proofPage);
    candidate.content[0].props.left[0].props.variant = "emphasis";
    await act(async () => view.editor.commit(candidate));
    await settleHistory();
    const target = view.element.querySelector('input[id="child:title"]');
    components.ProofText.variants = ["emphasis"];
    await shortcut(target, "z");
    expect(view.editor.page).toEqual(candidate);
    expect(view.editor.error).toContain("history entry no longer matches");
    components.ProofText.variants = ["plain", "emphasis"];
    await shortcut(target, "z");
    expect(view.editor.page).toEqual(proofPage);
    components.ProofText.variants = ["plain"];
    for (const meta of [false, true]) {
      await shortcut(target, "y", { meta });
      expect(view.editor.page).toEqual(proofPage);
      await shortcut(target, "z", { meta, shift: true });
      expect(view.editor.page).toEqual(proofPage);
    }
    components.ProofText.variants = ["plain", "emphasis"];
    await act(async () => view.editor.redo());
    expect(view.editor.page).toEqual(candidate);
  });
});

test("BODY history shortcuts retain validation after field replacement", async () => {
  for (const meta of [false, true]) {
    const components = structuredClone(proofComponents);
    await withEditor({ components }, async (view) => {
      await act(async () => view.editor.select("child"));
      const candidate = structuredClone(proofPage);
      candidate.content[0].props.left[0].props.variant = "emphasis";
      await act(async () => view.editor.commit(candidate));
      await settleHistory();
      await act(async () => view.element.querySelector('input[id="child:title"]').focus());
      await act(async () => document.activeElement.blur());
      expect(document.activeElement).toBe(document.body);
      components.ProofText.variants = ["emphasis"];
      expect(await shortcut(document.body, "z", { meta })).toBe(true);
      expect(view.editor.page).toEqual(candidate);
      expect(view.editor.error).toContain("history entry no longer matches");
      components.ProofText.variants = ["plain", "emphasis"];
      await shortcut(document.body, "z", { meta });
      expect(view.editor.page).toEqual(proofPage);
      components.ProofText.variants = ["plain"];
      for (const binding of [{ key: "y" }, { key: "z", shift: true }]) {
        await shortcut(document.body, binding.key, { meta, shift: binding.shift });
        expect(view.editor.page).toEqual(proofPage);
        expect(view.editor.error).toContain("history entry no longer matches");
      }
      components.ProofText.variants = ["plain", "emphasis"];
      await shortcut(document.body, "y", { meta });
      expect(view.editor.page).toEqual(candidate);
      await shortcut(document.body, "z", { meta });
      expect(view.editor.page).toEqual(proofPage);
      await shortcut(document.body, "z", { meta, shift: true });
      expect(view.editor.page).toEqual(candidate);
    });
  }
});

test("accepted history restores the current logical field and falls back when that Block disappears", async () => {
  await withEditor({}, async (view) => {
    await act(async () => view.editor.select("child"));
    await typeInput(view.element, "child:title", "Accepted title");
    await settleHistory();
    await act(async () => view.element.querySelector('input[id="child:title"]').focus());
    await shortcut(document.activeElement, "z");
    const current = view.element.querySelector('input[id="child:title"]');
    expect(current.value).toBe("Nested Block");
    expect(document.activeElement).toBe(current);
    await shortcut(document.activeElement, "y");
    expect(view.element.querySelector('input[id="child:title"]').value).toBe("Accepted title");
    expect(document.activeElement).toBe(view.element.querySelector('input[id="child:title"]'));
    await act(async () => view.editor.add("ProofText"));
    await settleHistory();
    const added = view.editor.selected;
    await act(async () => view.element.querySelector(`input[id="${added}:title"]`).focus());
    await shortcut(document.activeElement, "z");
    expect(view.element.querySelector(`input[id="${added}:title"]`)).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(view.element.contains(document.activeElement)).toBe(true);
  });
});

test("removal confirmation consumes history shortcuts without changing the Page or drafts", async () => {
  await withEditor({}, async (view) => {
    await act(async () => view.editor.select("child"));
    await typeInput(view.element, "child:title", "Accepted before removal");
    await settleHistory();
    await typeInput(view.element, "child:count", "invalid count");
    await act(async () => view.editor.remove("parent"));
    const dialog = view.element.querySelector('dialog[aria-labelledby="kerna-remove-title"]');
    expect(dialog.open).toBe(true);
    const accepted = structuredClone(view.editor.page);
    for (const key of ["z", "y"]) {
      await shortcut(dialog.querySelector("button"), key);
      expect(await shortcut(document.body, key)).toBe(true);
      expect(await shortcut(document.body, "z", { meta: true, shift: true })).toBe(true);
      expect(view.editor.page).toEqual(accepted);
      expect(view.editor.invalidDrafts).toBe(true);
    }
    await act(async () => view.editor.undo());
    expect(view.editor.page).toEqual(accepted);
    expect(view.editor.invalidDrafts).toBe(true);
    await view.click("Keep Block");
    await act(async () => view.editor.select("parent"));
    await act(async () => view.editor.undo());
    expect(view.editor.page).toEqual(proofPage);
  });
});

test("Outline uses heading labels and separate semantic controls without draggable targets", async () => {
  await withEditor({}, async (view) => {
    const outline = () => view.element.querySelector('nav[aria-label="Block outline"]');
    expect(outline().querySelector('button[aria-label="Select Nested Block"]')).toBeTruthy();
    expect(
      outline().querySelector('[draggable="true"], [aria-roledescription], [role="button"]'),
    ).toBeNull();
    for (const button of outline().querySelectorAll("button"))
      expect(button.querySelector("button, a, input, [tabindex]")).toBeNull();
    await view.click("Collapse Slots in Proof Columns");
    const slots = view.element.querySelector('[id="kerna-outline-slots:parent"]');
    expect(slots.hidden).toBe(true);
    expect(outline().querySelector('[aria-expanded="false"]').getAttribute("aria-controls")).toBe(
      slots.id,
    );
    // Uses the same public selection path as the preview channel, without
    // creating a Page history entry or moving keyboard focus into the outline.
    await act(async () => view.editor.select("child"));
    expect(slots.hidden).toBe(false);
    expect(outline().querySelector('[aria-pressed="true"]').getAttribute("aria-label")).toBe(
      "Select Nested Block",
    );
    expect(view.editor.canUndo).toBe(false);
    await typeInput(view.element, "child:title", "Renamed heading");
    expect(outline().querySelector('[aria-pressed="true"]').textContent).toContain(
      "Renamed heading",
    );
    await view.click("Select Proof Columns");
    expect(view.editor.selected).toBe("parent");
    await view.click("Select Renamed heading");
    expect(view.element.querySelector('input[id="child:title"]').value).toBe("Renamed heading");
    await view.panels(false);
    await view.panels(true);
    expect(outline().querySelector('[aria-pressed="true"]').getAttribute("aria-label")).toBe(
      "Select Renamed heading",
    );
  });
});

test("root preset placement names the containing root and regenerates every nested ID", async () => {
  await withEditor({}, async (view) => {
    expect(view.editor.destinationLabel).toBe("At Page end");
    await act(async () => expect(view.editor.add("ProofText")).toBe(true));
    expect(view.editor.page.content.map((block) => block.props.id)).toEqual(["parent", "new-1"]);
    expect(view.editor.selected).toBe("new-1");
    await act(async () => view.editor.select("parent"));
    expect(view.editor.destinationLabel).toBe("After Proof Columns");
    await act(async () => view.editor.add("ProofText"));
    expect(view.editor.page.content.map((block) => block.props.id)).toEqual([
      "parent",
      "new-2",
      "new-1",
    ]);
    await act(async () => view.editor.select("child"));
    expect(view.editor.destinationLabel).toBe("After containing root Block Proof Columns");
    expect(view.element.querySelector('[aria-label="Selected root Block"]')).toBeNull();
    await act(async () => view.editor.add("ProofColumns"));
    expect(view.editor.page.content.map((block) => block.props.id)).toEqual([
      "parent",
      "new-3",
      "new-2",
      "new-1",
    ]);
    expect(view.editor.page.content[1].props.left[0].props.id).toBe("new-4");
    expect(view.editor.selected).toBe("new-3");
    expect(proofPresets.ProofColumns.props.id).toBe("preset-columns");
    expect(proofPresets.ProofColumns.props.left[0].props.id).toBe("preset-left");
  });
});

test("missing and invalid presets diagnose only their own choice and never change state", async () => {
  await withEditor({ presets: { ProofText: proofPresets.ProofText } }, async (view) => {
    expect(view.editor.choices.find((item) => item.component === "ProofColumns").error).toContain(
      "site developer",
    );
    expect(view.editor.choices.find((item) => item.component === "ProofText").error).toBe("");
    await act(async () => view.editor.select("child"));
    await act(async () => expect(view.editor.add("ProofColumns")).toBe(false));
    await settleHistory();
    expect(view.editor.page).toEqual(proofPage);
    expect(view.editor.selected).toBe("child");
    expect(view.editor.canUndo).toBe(false);
    await act(async () => expect(view.editor.add("ProofText")).toBe(true));
  });
  await withEditor(
    {
      presets: {
        ...proofPresets,
        ProofText: { type: "ProofText", props: { id: "bad", variant: "plain" } },
      },
    },
    async (view) => {
      expect(view.editor.choices.find((item) => item.component === "ProofText").error).toContain(
        "invalid",
      );
      expect(view.editor.choices.find((item) => item.component === "ProofColumns").error).toBe("");
      await act(async () => view.editor.select("parent"));
      const add = [...view.element.querySelectorAll("button")].find(
        (item) => item.textContent === "Add Proof Text to left",
      );
      expect(add.disabled).toBe(true);
      await act(async () => expect(view.editor.add("ProofText")).toBe(false));
      expect(view.editor.page).toEqual(proofPage);
      expect(view.editor.canUndo).toBe(false);
    },
  );
});

test("root controls reorder by identity and remove, undo and redo without stale selection", async () => {
  await withEditor({}, async (view) => {
    await act(async () => view.editor.add("ProofText"));
    await settleHistory();
    await view.click("Move New text up");
    expect(view.editor.page.content[0].props.id).toBe("new-1");
    expect(view.editor.selected).toBe("new-1");
    await settleHistory();
    await view.click("Remove New text");
    expect(view.editor.selected).toBe("parent");
    await settleHistory();
    await act(async () => view.editor.undo());
    expect(view.editor.selected).toBe("new-1");
    expect(view.editor.page.content[0].props.id).toBe("new-1");
    await act(async () => view.editor.redo());
    expect(view.editor.selected).toBe("parent");
    await act(async () => view.editor.remove("parent"));
    expect(view.editor.page.content).toEqual([]);
    expect(view.editor.selected).toBeUndefined();
    await settleHistory();
    await act(async () => view.editor.undo());
    expect(view.editor.selected).toBe("parent");
  });
});

test("parent Slot controls add, reorder, remove and reveal the child's parent", async () => {
  await withEditor({}, async (view) => {
    await act(async () => view.editor.select("parent"));
    await view.click("Add Proof Text to left");
    expect(view.editor.selected).toBe("new-1");
    expect(view.editor.page.content[0].props.left.map((block) => block.props.id)).toEqual([
      "child",
      "new-1",
    ]);
    await view.click("Manage left in parent");
    expect(view.editor.selected).toBe("parent");
    expect(document.activeElement.id).toBe("kerna-slot:parent:left");
    await view.click("Move New text up");
    expect(view.editor.page.content[0].props.left.map((block) => block.props.id)).toEqual([
      "new-1",
      "child",
    ]);
    expect(view.editor.selected).toBe("parent");
    await view.click("Remove New text");
    expect(view.editor.page.content[0].props.left.map((block) => block.props.id)).toEqual([
      "child",
    ]);
    await view.click("Remove Nested Block");
    expect(view.editor.error).toBeTruthy();
    expect(view.editor.page.content[0].props.left).toEqual(proofPage.content[0].props.left);
  });
});

test("core rejects Slot accepts, max and depth candidates before Puck history", async () => {
  const slot = {
    container: { kind: "slot", parentId: "parent", slot: "left" },
    position: { kind: "end" },
  };
  await withEditor({}, async (view) => {
    await act(async () => expect(view.editor.add("ProofColumns", slot)).toBe(false));
    expect(view.editor.page).toEqual(proofPage);
    expect(view.editor.canUndo).toBe(false);
    await act(async () => view.editor.remove("child"));
    expect(view.editor.page).toEqual(proofPage);
    await act(async () => view.editor.add("ProofText", slot));
    await act(async () => view.editor.add("ProofText", slot));
    await settleHistory();
    const before = structuredClone(view.editor.page);
    await act(async () => expect(view.editor.add("ProofText", slot)).toBe(false));
    expect(view.editor.page).toEqual(before);
    await settleHistory();
    await act(async () => view.editor.undo());
    expect(view.editor.page).toEqual(proofPage);
  });
  const recursive = {
    ...proofComponents,
    ProofColumns: {
      ...proofComponents.ProofColumns,
      slots: {
        left: { accepts: ["ProofText", "ProofColumns"], min: 1, max: 3 },
        right: { accepts: ["ProofText"], min: 0, max: 3 },
      },
    },
  };
  await withEditor({ components: recursive }, async (view) => {
    await act(async () => expect(view.editor.add("ProofColumns", slot)).toBe(false));
    expect(view.editor.error).toMatch(/depth|level/i);
    expect(view.editor.page).toEqual(proofPage);
    await settleHistory();
    expect(view.editor.canUndo).toBe(false);
  });
});

test("subtree removal confirms affected drafts only; hiding panels retains drafts and Puck state", async () => {
  await withEditor({}, async (view) => {
    await act(async () => view.editor.add("ProofText"));
    await settleHistory();
    await typeInput(view.element, "new-1:count", "outside invalid");
    await act(async () => view.editor.select("child"));
    await typeInput(view.element, "child:count", "inside invalid");
    const before = structuredClone(view.editor.page);
    await view.panels(false);
    expect(view.editor.invalidDrafts).toBe(true);
    expect(view.editor.selected).toBe("child");
    await view.panels(true);
    expect(view.element.querySelector('input[id="child:count"]').value).toBe("inside invalid");
    await act(async () => view.editor.remove("parent"));
    expect(view.element.querySelector("dialog").open).toBe(true);
    await view.click("Keep Block");
    expect(view.editor.page).toEqual(before);
    expect(view.editor.selected).toBe("child");
    expect(view.editor.invalidDrafts).toBe(true);
    await act(async () => view.editor.remove("parent"));
    await view.click("Remove Block and drafts");
    expect(view.editor.page.content.map((block) => block.props.id)).toEqual(["new-1"]);
    expect(view.editor.selected).toBe("new-1");
    expect(view.editor.invalidDrafts).toBe(true);
    expect(view.element.querySelector('input[id="new-1:count"]').value).toBe("outside invalid");
    await settleHistory();
    await act(async () => view.editor.undo());
    expect(view.editor.page).toEqual(before);
    expect(view.editor.selected).toBe("parent");
    await act(async () => view.editor.select("child"));
    expect(view.element.querySelector('input[id="child:count"]').value).toBe("1");
    await act(async () => view.editor.select("new-1"));
    expect(view.element.querySelector('input[id="new-1:count"]').value).toBe("outside invalid");
  });
});

async function withProof(compact, run, options = {}) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const initialPage = options.initialPage ?? { formatVersion: 1, root: { props: {} }, content: [] };
  vi.stubGlobal("matchMedia", () => ({
    matches: compact,
    addEventListener() {},
    removeEventListener() {},
  }));
  // Exercise shell lifecycle only; this response is not host-renderer evidence.
  const fetchMock = vi.fn(
    options.fetch ??
      (async (url, options) =>
        String(url).endsWith("kerna-preview")
          ? new Response(
              `<p>Fixture preview</p><script data-kerna-bridge="${JSON.parse(options.body).binding.token}" nonce="fixture"></script>`,
              { status: 200 },
            )
          : Response.json({
              data: { _rev: "1", item: { data: { page: initialPage, title: "Fixture Page" } } },
            })),
  );
  vi.stubGlobal("fetch", fetchMock);
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  let guard;
  const unregister = vi.fn(() => {
    guard = undefined;
  });
  const registerNavigationGuard = (handler) => {
    guard = handler;
    return unregister;
  };
  const tokens = {};
  const render = async (id = "fixture") =>
    act(async () =>
      root.render(
        createElement(EditorProof, {
          components: proofComponents,
          tokens,
          presets: proofPresets,
          id,
          registerNavigationGuard,
          onClose: () => {},
        }),
      ),
    );
  const button = (name) =>
    [...element.querySelectorAll("button")].find(
      (item) => (item.getAttribute("aria-label") ?? item.textContent) === name,
    );
  const click = async (name) => {
    expect(button(name), name).toBeTruthy();
    await act(async () => button(name).click());
  };
  try {
    await render();
    await click("Open editor");
    await run({ element, click, button, fetchMock, render, navigate: () => guard(), unregister });
  } finally {
    await act(async () => root.unmount());
    element.remove();
    vi.unstubAllGlobals();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  }
}

test("empty proof Page has associated keyboard tabs and preset insertion opens Fields without replacing its iframe", async () => {
  await withProof(false, async ({ element, click, fetchMock }) => {
    expect(element.textContent).toContain("No Blocks yet.");
    await click("Add a Component");
    const tab = element.querySelector('[role="tab"][aria-selected="true"]');
    expect(tab.textContent).toBe("Components");
    expect(document.activeElement).toBe(tab);
    expect(element.querySelector('[role="tabpanel"]').id).toBe(tab.getAttribute("aria-controls"));
    expect(element.textContent).toContain("At Page end");
    await act(async () =>
      tab.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })),
    );
    expect(element.querySelector('[role="tab"][aria-selected="true"]').textContent).toBe("Outline");
    await act(async () =>
      document.activeElement.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
      ),
    );
    expect(element.querySelector('[role="tab"][aria-selected="true"]').textContent).toBe(
      "Components",
    );
    const iframe = element.querySelector('iframe[title="Page preview"]');
    expect(iframe).toBeTruthy();
    await click("Add Proof Columns");
    expect(document.activeElement.getAttribute("aria-label")).toBe("Fields");
    expect(element.querySelector('[aria-label="left Slot"]')).toBeTruthy();
    expect(element.querySelector('iframe[title="Page preview"]')).toBe(iframe);
    const request = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("kerna-preview"))
      .at(-1);
    const sent = JSON.parse(request[1].body).page;
    expect(sent.content[0].type).toBe("ProofColumns");
    expect(sent.content[0].props.id).not.toBe("preset-columns");
    expect(sent.content[0].props.left[0].props.id).not.toBe("preset-left");
    await click("Focus");
    expect(element.querySelector('[aria-label="Fields"]')).toBeNull();
    await click("Focus");
    expect(element.querySelector('[aria-label="left Slot"]')).toBeTruthy();
    expect(element.querySelector('iframe[title="Page preview"]')).toBe(iframe);
  });
});

test("shell history has one route and Leave confirmation prevents hidden history changes", async () => {
  await withProof(
    false,
    async (view) => {
      await view.click("Select Nested Block");
      await typeInput(view.element, "child:title", "First accepted title");
      await settleHistory();
      await typeInput(view.element, "child:title", "Second accepted title");
      await settleHistory();
      await typeInput(view.element, "child:count", "invalid count");
      const count = view.element.querySelector('input[id="child:count"]');
      await act(async () => count.focus());
      await shortcut(count, "z");
      expect(count.value).toBe("1");
      const title = () => view.element.querySelector('input[id="child:title"]').value;
      expect(title()).toBe("Second accepted title");
      expect(view.button("Redo").disabled).toBe(true);
      await shortcut(count, "z");
      expect(title()).toBe("First accepted title");
      await view.click("Return");
      const dialog = view.element.querySelector('dialog[aria-labelledby="kerna-leave-title"]');
      expect(dialog.open).toBe(true);
      for (const key of ["z", "y"]) {
        expect(await shortcut(view.button("Keep editing"), key)).toBe(true);
        expect(await shortcut(document.body, key)).toBe(true);
        expect(await shortcut(document.body, "z", { meta: true, shift: true })).toBe(true);
        expect(title()).toBe("First accepted title");
      }
      await view.click("Keep editing");
      await view.click("Redo");
      expect(title()).toBe("Second accepted title");
      await view.click("Undo");
      expect(title()).toBe("First accepted title");
    },
    { initialPage: proofPage },
  );
});

test("Alt Shift F preserves iframe, selection, invalid drafts and history with reachable focus", async () => {
  for (const compact of [false, true]) {
    await withProof(
      compact,
      async (view) => {
        if (compact) await view.click("Outline");
        await view.click("Select Nested Block");
        if (compact) await view.click("Close panel");
        await typeInput(view.element, "child:title", "Accepted before Focus");
        await settleHistory();
        await typeInput(view.element, "child:count", "invalid count");
        const count = view.element.querySelector('input[id="child:count"]');
        await act(async () => count.focus());
        const iframe = view.element.querySelector("iframe");
        const focus = view.button("Focus");
        expect(focus.getAttribute("aria-keyshortcuts")).toBe("Alt+Shift+F");
        expect(await shortcut(count, "F", { alt: true, shift: true })).toBe(true);
        expect(focus.getAttribute("aria-pressed")).toBe("true");
        expect(document.activeElement).toBe(focus);
        expect(view.element.querySelector('[aria-label="Fields"]')).toBeNull();
        await shortcut(focus, "F", { alt: true, shift: true });
        expect(focus.getAttribute("aria-pressed")).toBe("false");
        expect(view.element.querySelector('input[id="child:count"]').value).toBe("invalid count");
        expect(view.element.querySelector('input[id="child:title"]').value).toBe(
          "Accepted before Focus",
        );
        expect(view.element.querySelector("iframe")).toBe(iframe);
        expect(view.button("Save").disabled).toBe(false);
        await view.click("Save");
        expect(
          view.element.querySelector('input[id="child:count"]').getAttribute("aria-invalid"),
        ).toBe("true");
        expect(view.element.textContent).toContain(
          "Resolve the highlighted field errors before saving.",
        );
        await view.click("Undo");
        expect(view.element.querySelector('input[id="child:title"]').value).toBe("Nested Block");
        await view.click("Return");
        await shortcut(view.button("Keep editing"), "F", { alt: true, shift: true });
        expect(focus.getAttribute("aria-pressed")).toBe("false");
        await view.click("Keep editing");
      },
      { initialPage: proofPage },
    );
  }
});

test("history keeps logical field focus and the Focus shortcut reachable at both shell sizes", async () => {
  for (const compact of [false, true]) {
    await withProof(
      compact,
      async (view) => {
        if (compact) await view.click("Outline");
        await view.click("Select Nested Block");
        if (compact) await view.click("Close panel");
        await typeInput(view.element, "child:title", "Accepted title");
        await settleHistory();
        const iframe = view.element.querySelector("iframe");
        await act(async () => view.element.querySelector('input[id="child:title"]').focus());
        await shortcut(document.activeElement, "z");
        expect(document.activeElement).toBe(view.element.querySelector('input[id="child:title"]'));
        expect(document.activeElement.value).toBe("Nested Block");
        await shortcut(document.activeElement, "F", { alt: true, shift: true });
        expect(view.button("Focus").getAttribute("aria-pressed")).toBe("true");
        expect(document.activeElement).toBe(view.button("Focus"));
        expect(view.element.querySelector("iframe")).toBe(iframe);
      },
      { initialPage: proofPage },
    );
  }
});

test("unmount with a pending modal removes keyboard listeners and reopening has one history route", async () => {
  const add = vi.spyOn(document, "addEventListener");
  const remove = vi.spyOn(document, "removeEventListener");
  const host = document.createElement("input");
  document.body.append(host);
  try {
    for (let cycle = 0; cycle < 2; cycle++) {
      const start = add.mock.calls.length;
      await withProof(
        false,
        async (view) => {
          await view.click("Select Nested Block");
          await typeInput(view.element, "child:title", "Accepted title");
          await settleHistory();
          await act(async () => view.element.querySelector('input[id="child:title"]').focus());
          await shortcut(document.activeElement, "z");
          expect(view.element.querySelector('input[id="child:title"]').value).toBe("Nested Block");
          await shortcut(document.activeElement, "y");
          expect(view.element.querySelector('input[id="child:title"]').value).toBe(
            "Accepted title",
          );
          await view.click("Return");
          expect(
            view.element.querySelector('dialog[aria-labelledby="kerna-leave-title"]').open,
          ).toBe(true);
          await shortcut(document.body, "z");
          expect(view.element.querySelector('input[id="child:title"]').value).toBe(
            "Accepted title",
          );
        },
        { initialPage: proofPage },
      );
      const listeners = add.mock.calls
        .slice(start)
        .filter(([type]) => type === "keydown" || type === "focusin");
      expect(listeners.some(([type, , capture]) => type === "keydown" && capture === true)).toBe(
        true,
      );
      for (const [type, listener, capture] of listeners) {
        expect(
          remove.mock.calls.some(
            ([removedType, removedListener, removedCapture]) =>
              type === removedType && listener === removedListener && capture === removedCapture,
          ),
        ).toBe(true);
      }
      expect(document.querySelector("dialog[open]")).toBeNull();
      host.focus();
      expect(await shortcut(host, "z")).toBe(false);
      expect(await shortcut(host, "y", { meta: true })).toBe(false);
      expect(await shortcut(host, "F", { alt: true, shift: true })).toBe(false);
      expect(document.activeElement).toBe(host);
    }
  } finally {
    host.remove();
    add.mockRestore();
    remove.mockRestore();
  }
});

test("compact buttons open the requested tab and insertion closes the drawer even from Focus mode", async () => {
  await withProof(true, async ({ element, click }) => {
    await click("Focus");
    await click("Components");
    const drawer = element.querySelector('dialog[aria-label="Components and Outline"]');
    expect(drawer.open).toBe(true);
    expect(drawer.querySelector('[role="tab"][aria-selected="true"]').textContent).toBe(
      "Components",
    );
    await click("Add Proof Text");
    expect(drawer.open).toBe(false);
    expect(document.activeElement.getAttribute("aria-label")).toBe("Fields");
    expect(element.querySelector('input[id$=":title"]').value).toBe("New text");
    await click("Outline");
    expect(drawer.open).toBe(true);
    expect(drawer.querySelector('[role="tab"][aria-selected="true"]').textContent).toBe("Outline");
    await click("Close panel");
    expect(element.querySelector('input[id$=":title"]').value).toBe("New text");
  });
});

test("preview failure retains accepted edits and invalid input; Retry renders the current valid Page", async () => {
  let failPreview = false;
  const candidates = [];
  await withProof(
    false,
    async (view) => {
      await view.click("Select Nested Block");
      const iframe = view.element.querySelector("iframe");
      failPreview = true;
      await typeInput(view.element, "child:title", "Kept after preview failure");
      await typeInput(view.element, "child:count", "not a number");
      expect(view.element.textContent).toContain("Preview could not load. Your changes are kept.");
      expect(view.element.querySelector('input[id="child:title"]').value).toBe(
        "Kept after preview failure",
      );
      expect(view.element.querySelector('input[id="child:count"]').value).toBe("not a number");
      expect(view.button("Save").disabled).toBe(false);
      await view.click("Save");
      expect(
        view.element.querySelector('input[id="child:count"]').getAttribute("aria-invalid"),
      ).toBe("true");
      expect(view.element.querySelector("iframe")).toBe(iframe);
      expect(iframe.inert).toBe(true);
      failPreview = false;
      await view.click("Retry preview");
      expect(candidates.at(-1).content[0].props.left[0].props).toMatchObject({
        title: "Kept after preview failure",
        count: 1,
      });
      expect(view.element.textContent).not.toContain("Preview could not load.");
      expect(view.element.querySelector('input[id="child:count"]').value).toBe("not a number");
      expect(view.element.querySelector("iframe")).toBe(iframe);
    },
    {
      initialPage: proofPage,
      fetch: async (url, options) => {
        if (!String(url).endsWith("kerna-preview"))
          return Response.json({
            data: { _rev: "1", item: { data: { page: proofPage, title: "Fixture Page" } } },
          });
        const body = JSON.parse(options.body);
        candidates.push(body.page);
        return failPreview
          ? new Response("Unavailable", { status: 503 })
          : new Response(
              `<p>Current preview</p><script data-kerna-bridge="${body.binding.token}" nonce="fixture"></script>`,
            );
      },
    },
  );
});

test("dirty Return and registered navigation guard cancel or confirm without losing input; cleanup restores host focus", async () => {
  const overflow = document.body.style.overflow;
  await withProof(
    false,
    async (view) => {
      await view.click("Select Nested Block");
      await typeInput(view.element, "child:count", "invalid draft");
      const beforeUnload = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(beforeUnload);
      expect(beforeUnload.defaultPrevented).toBe(true);
      await view.click("Return");
      expect(view.element.querySelector('dialog[aria-labelledby="kerna-leave-title"]').open).toBe(
        true,
      );
      await view.click("Keep editing");
      expect(view.element.querySelector('input[id="child:count"]').value).toBe("invalid draft");
      let navigating = Promise.resolve(true);
      await act(async () => {
        navigating = view.navigate();
      });
      await view.click("Keep editing");
      expect(await navigating).toBe(true);
      await act(async () => {
        navigating = view.navigate();
      });
      await view.click("Leave without saving");
      expect(await navigating).toBe(false);
      // The real router owns navigation after approval. Return owns local close.
      await view.click("Return");
      await view.click("Leave without saving");
      expect(view.element.querySelector("[data-kerna-editor]")).toBeNull();
      expect(view.element.querySelector(".kerna-proof-workspace")).toBeNull();
      expect(document.activeElement).toBe(view.button("Open editor"));
      expect(document.body.style.overflow).toBe(overflow);
      expect(view.unregister).toHaveBeenCalledTimes(1);
      const after = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(after);
      expect(after.defaultPrevented).toBe(false);
    },
    { initialPage: proofPage },
  );
});

test("invalid, missing and denied stored Pages expose diagnostics and Return without mutation controls", async () => {
  for (const response of [
    () =>
      Response.json({
        data: {
          _rev: "1",
          item: {
            data: {
              page: {
                ...proofPage,
                content: [{ type: "Disabled", props: { id: "old", variant: "old" } }],
              },
              title: "Invalid",
            },
          },
        },
      }),
    () => new Response("Not found", { status: 404 }),
    () => new Response("Denied", { status: 403 }),
  ]) {
    await withProof(
      false,
      async (view) => {
        expect(view.element.querySelector('[role="alert"]')).toBeTruthy();
        expect(view.element.querySelector(".kerna-proof-workspace")).toBeNull();
        expect(view.element.querySelector("iframe, input, [data-kerna-action=save]")).toBeNull();
        expect(view.fetchMock).toHaveBeenCalledTimes(1);
        await view.click("Return");
        expect(document.activeElement).toBe(view.button("Open editor"));
      },
      { fetch: async () => response() },
    );
  }
});

test("late Page A load cannot replace Page B or revive its preview session", async () => {
  let resolveA;
  let signalA;
  await withProof(
    false,
    async (view) => {
      expect(view.element.textContent).toContain("Loading Page");
      await view.render("page-b");
      expect(signalA.aborted).toBe(true);
      expect(view.element.querySelector(".kerna-proof-toolbar h1").textContent).toBe("Page B");
      const iframe = view.element.querySelector("iframe");
      await act(async () =>
        resolveA(
          Response.json({
            data: { _rev: "a", item: { data: { page: proofPage, title: "Page A" } } },
          }),
        ),
      );
      expect(view.element.querySelector(".kerna-proof-toolbar h1").textContent).toBe("Page B");
      expect(view.element.querySelector("iframe")).toBe(iframe);
      const previews = view.fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith("kerna-preview"),
      );
      expect(previews).toHaveLength(1);
      expect(JSON.parse(previews[0][1].body).id).toBe("page-b");
    },
    {
      fetch: async (url, options) => {
        if (String(url).endsWith("/fixture")) {
          signalA = options.signal;
          return new Promise((resolve) => {
            resolveA = resolve;
          });
        }
        if (String(url).endsWith("kerna-preview"))
          return new Response(
            `<p>Page B</p><script data-kerna-bridge="${JSON.parse(options.body).binding.token}" nonce="fixture"></script>`,
          );
        return Response.json({
          data: { _rev: "b", item: { data: { page: proofPage, title: "Page B" } } },
        });
      },
    },
  );
});

test("save keeps edits made while the accepted snapshot is in flight dirty", async () => {
  let resolveSave;
  await withProof(
    false,
    async (view) => {
      await view.click("Select Nested Block");
      await typeInput(view.element, "child:title", "First saved title");
      await act(async () => {
        view.button("Save").click();
        await Promise.resolve();
      });
      expect(view.fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("kerna_pages/fixture"),
        expect.objectContaining({ method: "PUT" }),
      );
      await typeInput(view.element, "child:title", "Edit during save");
      await act(async () => {
        resolveSave(Response.json({ data: { _rev: "2" } }));
      });
      expect(view.element.querySelector('input[id="child:title"]').value).toBe("Edit during save");
      expect(view.element.textContent).toContain("Unsaved changes");
      expect(view.element.textContent).toContain("Draft saved.");
    },
    {
      initialPage: proofPage,
      fetch: async (url, options) => {
        if (String(url).endsWith("kerna-preview"))
          return new Response(
            `<p>Preview</p><script data-kerna-bridge="${JSON.parse(options.body).binding.token}" nonce="fixture"></script>`,
          );
        if (options?.method === "PUT")
          return new Promise((resolve) => {
            resolveSave = resolve;
          });
        return Response.json({
          data: { _rev: "1", item: { data: { page: proofPage, title: "Fixture Page" } } },
        });
      },
    },
  );
});

test.each([
  ["missing revision", async () => Response.json({ success: true, data: {} })],
  [
    "network exception",
    async () => {
      throw new TypeError("Failed to fetch");
    },
  ],
])("uncertain save (%s) retains input and asks the reviewer to reopen", async (_name, save) => {
  await withProof(
    false,
    async (view) => {
      await view.click("Select Nested Block");
      await typeInput(view.element, "child:title", "Keep this draft");
      await view.click("Save");
      expect(view.element.querySelector('input[id="child:title"]').value).toBe("Keep this draft");
      expect(view.element.textContent).toContain("The save outcome is uncertain.");
      expect(view.element.textContent).toContain("check or reopen this Page");
      expect(view.element.textContent).not.toContain("Failed to fetch");
    },
    {
      initialPage: proofPage,
      fetch: async (url, options) => {
        if (String(url).endsWith("kerna-preview"))
          return new Response(
            `<p>Preview</p><script data-kerna-bridge="${JSON.parse(options.body).binding.token}" nonce="fixture"></script>`,
          );
        if (options?.method === "PUT") return save();
        return Response.json({
          data: { _rev: "1", item: { data: { page: proofPage, title: "Fixture Page" } } },
        });
      },
    },
  );
});

test("site Hero preset is explicit; disabled Components and colliding IDs leave Puck unchanged", async () => {
  await withEditor({ components: { ...siteComponents, ...proofComponents } }, async (view) => {
    expect(view.editor.choices.every((choice) => !choice.error)).toBe(true);
    await act(async () => expect(view.editor.add("Hero")).toBe(true));
    expect(view.editor.page.content[1]).toEqual({
      type: "Hero",
      props: {
        id: "new-1",
        variant: "centered",
        title: "Welcome",
      },
    });
  });
  await withEditor({ generateId: () => "child" }, async (view) => {
    await act(async () => view.editor.select("child"));
    await act(async () => expect(view.editor.add("ProofText")).toBe(false));
    expect(view.editor.error).toContain("unique");
    expect(view.editor.selected).toBe("child");
    expect(view.editor.page).toEqual(proofPage);
    await act(async () => expect(view.editor.add("Hero")).toBe(false));
    expect(view.editor.error).toContain("not enabled");
    expect(view.editor.choices.some((choice) => choice.component === "Hero")).toBe(false);
    await settleHistory();
    expect(view.editor.canUndo).toBe(false);
    expect(view.editor.selected).toBe("child");
    expect(view.editor.page).toEqual(proofPage);
  });
});
