// @ts-check
"use strict";

/** @typedef {'item' | 'heading' | 'divider'} ItemKind */
/** @typedef {{id: string, kind: ItemKind, text: string, checked: boolean, createdAt: string, updatedAt: string}} ListItem */
/** @typedef {{id: string, name: string, items: ListItem[], createdAt: string, updatedAt: string, schemaVersion: 1}} ShoppingList */
/** @typedef {{key: string, value: unknown}} Preference */
/** @typedef {{lists: ShoppingList[], preferences: Preference[]}} Snapshot */
/** @typedef {{mode: 'new-list' | 'rename-list' | 'delete-list' | 'edit-item' | 'delete-item', listId: string | null, itemId?: string}} EditorContext */
/** @typedef {{pointerId: number, handle: HTMLButtonElement, row: HTMLLIElement, listId: string, itemId: string, startY: number, y: number, offsetY: number, started: boolean, preview: HTMLLIElement | null, frame: number, originalIds: string[]}} DragSession */

/** @template {HTMLElement} T @param {string} id @returns {T} */
function element(id) {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Element fehlt: ${id}`);
  return /** @type {T} */ (found);
}

const ui = {
  shell: element("app-shell"), select: /** @type {HTMLSelectElement} */ (element("list-select")),
  list: element("shopping-list"), viewport: element("list-viewport"), newList: element("new-list"),
  menuToggle: element("list-menu-toggle"), menu: element("list-menu"), all: element("toggle-all"),
  allLabel: element("all-label"), count: element("item-count"), progress: element("progress-fill"),
  searchForm: element("search-form"), search: /** @type {HTMLInputElement} */ (element("list-search")), searchClear: element("search-clear"), searchCount: element("search-count"),
  normal: element("scale-normal"), large: element("scale-large"), item: element("kind-item"), heading: element("kind-heading"), divider: element("add-divider"),
  composer: /** @type {HTMLFormElement} */ (element("composer")), input: /** @type {HTMLInputElement} */ (element("new-text")), add: element("add-item"),
  composerPanel: element("composer-panel"), composerGrip: /** @type {HTMLButtonElement} */ (element("composer-grip")), composerContent: element("composer-content"),
  empty: element("empty-state"), emptyText: element("empty-text"), emptyCreate: element("empty-create"),
  status: element("save-status"), statusText: element("save-status-text"),
  error: element("storage-error"), errorMessage: element("storage-error-message"), retry: element("retry-storage"),
  dialog: /** @type {HTMLDialogElement} */ (element("editor")), form: /** @type {HTMLFormElement} */ (element("editor-form")),
  dialogTitle: element("dialog-title"), fields: element("dialog-fields"), dialogError: element("dialog-error"),
  save: /** @type {HTMLButtonElement} */ (element("save-dialog")), remove: /** @type {HTMLButtonElement} */ (element("dialog-delete")),
  close: element("close-dialog"), cancel: element("cancel-dialog"), toast: element("toast"), announcer: element("announcer"), landscape: element("landscape-notice")
};

/** @returns {string} */
function uuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** @param {string} name @returns {ShoppingList} */
function makeList(name) {
  const now = new Date().toISOString();
  return { id: uuid(), name, items: [], createdAt: now, updatedAt: now, schemaVersion: 1 };
}

// This is the only persistence boundary. Stable IDs and versioned documents leave
// room for a future sync adapter; there is no remote storage or sync code here.
class LocalStore {
  /** @param {IDBDatabase} database */
  constructor(database) { this.database = database; }

  /** @returns {Promise<LocalStore>} */
  static open() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) { reject(new Error("IndexedDB ist nicht verfügbar.")); return; }
      const request = indexedDB.open("einkaufsliste-local", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("lists", { keyPath: "id" });
        db.createObjectStore("preferences", { keyPath: "key" });
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Ein anderer Tab blockiert den lokalen Speicher. Bitte schließe ältere Tabs."));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          showFatal("Die Speicherversion wurde in einem anderen Tab geändert. Bitte lade die Seite neu.");
        };
        resolve(new LocalStore(db));
      };
    });
  }

  /** @param {string[]} stores @param {(transaction: IDBTransaction) => void} work @returns {Promise<void>} */
  write(stores, work) {
    return new Promise((resolve, reject) => {
      const tx = this.database.transaction(stores, "readwrite");
      /** @type {unknown} */ let failure = null;
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure || tx.error || new Error("Speichern fehlgeschlagen."));
      tx.onerror = () => { /* The abort handler reports failed requests. */ };
      try { work(tx); } catch (error) { failure = error; tx.abort(); }
    });
  }

  /** @returns {Promise<void>} */
  initialize() {
    return this.write(["lists", "preferences"], tx => {
      const preferences = tx.objectStore("preferences");
      const request = preferences.get("initialized");
      request.onsuccess = () => {
        if (request.result) return;
        const list = makeList("Einkaufsliste");
        tx.objectStore("lists").add(list);
        preferences.put({ key: "activeListId", value: list.id });
        preferences.put({ key: "large", value: false });
        preferences.put({ key: "initialized", value: true });
      };
    });
  }

  /** @returns {Promise<Snapshot>} */
  snapshot() {
    return new Promise((resolve, reject) => {
      const tx = this.database.transaction(["lists", "preferences"], "readonly");
      const lists = tx.objectStore("lists").getAll();
      const preferences = tx.objectStore("preferences").getAll();
      tx.oncomplete = () => resolve({ lists: lists.result, preferences: preferences.result });
      tx.onabort = () => reject(tx.error || new Error("Lesen fehlgeschlagen."));
    });
  }

  /** @param {string} key @param {unknown} value @returns {Promise<void>} */
  preference(key, value) {
    return this.write(["preferences"], tx => { tx.objectStore("preferences").put({ key, value }); });
  }

  /** @param {ShoppingList} list @returns {Promise<void>} */
  create(list) {
    return this.write(["lists", "preferences"], tx => {
      tx.objectStore("lists").add(list);
      tx.objectStore("preferences").put({ key: "activeListId", value: list.id });
    });
  }

  /** @param {string} id @param {(list: ShoppingList) => void} change @returns {Promise<void>} */
  update(id, change) {
    // Read and write in one transaction so edits in another tab are preserved.
    return this.write(["lists"], tx => {
      const store = tx.objectStore("lists");
      const request = store.get(id);
      request.onsuccess = () => {
        const list = /** @type {ShoppingList | undefined} */ (request.result);
        if (!list) { tx.abort(); return; }
        change(list);
        list.updatedAt = new Date().toISOString();
        store.put(list);
      };
    });
  }

  /** @param {string} id @returns {Promise<void>} */
  remove(id) {
    return this.write(["lists", "preferences"], tx => {
      const lists = tx.objectStore("lists");
      lists.delete(id);
      const request = lists.getAll();
      request.onsuccess = () => {
        const remaining = /** @type {ShoppingList[]} */ (request.result);
        remaining.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
        tx.objectStore("preferences").put({ key: "activeListId", value: remaining[0]?.id || null });
      };
    });
  }
}

/** @type {{store: LocalStore | null, lists: ShoppingList[], activeId: string | null, large: boolean, kind: 'item' | 'heading', query: string, ready: boolean, pending: number, failed: boolean, editor: EditorContext | null, drag: DragSession | null, refreshPending: boolean, composerCollapsed: boolean}} */
const state = { store: null, lists: [], activeId: null, large: false, kind: "item", query: "", ready: false, pending: 0, failed: false, editor: null, drag: null, refreshPending: false, composerCollapsed: false };
let writeQueue = Promise.resolve();
let toastTimer = 0;
let ignoreClickUntil = 0;
/** @type {{pointerId: number, startY: number, y: number, moved: boolean} | null} */
let composerDrag = null;
let ignoreComposerClick = false;
let editorSaving = false;
/** @type {HTMLElement | null} */ let dialogReturnFocus = null;
const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("einkaufsliste-local-changes") : null;

/** @returns {ShoppingList | undefined} */
function activeList() { return state.lists.find(list => list.id === state.activeId); }

/** @param {string} text @returns {string} */
function searchText(text) {
  return text.toLocaleLowerCase("de").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss");
}

/** @param {ShoppingList | undefined} [list] @returns {ListItem[]} */
function visibleItems(list = activeList()) {
  const terms = searchText(state.query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return list?.items || [];
  return list?.items.filter(item => item.kind !== "divider" && terms.every(term => searchText(item.text).includes(term))) || [];
}

function clearSearch() {
  state.query = ""; ui.search.value = ""; render(); ui.viewport.scrollTop = 0;
}

/** @param {string} text */
function announce(text) { ui.announcer.textContent = ""; requestAnimationFrame(() => { ui.announcer.textContent = text; }); }

/** @param {string} text */
function toast(text) {
  window.clearTimeout(toastTimer);
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  announce(text);
  toastTimer = window.setTimeout(() => { ui.toast.hidden = true; }, 3500);
}

function renderStatus() {
  ui.status.dataset.state = state.failed ? "error" : state.pending ? "saving" : "saved";
  ui.statusText.textContent = state.failed ? "Speicherfehler" : state.pending ? "Speichern …" : "Lokal gespeichert";
}

/** @param {string} message */
function showFatal(message) {
  state.ready = false;
  state.failed = true;
  ui.errorMessage.textContent = message;
  ui.error.hidden = false;
  render();
}

/** @param {boolean} [initial] */
async function refresh(initial = false) {
  if (!state.store) return;
  if (state.drag) { state.refreshPending = true; return; }
  const snapshot = await state.store.snapshot();
  snapshot.lists.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  state.lists = snapshot.lists;
  const preferences = new Map(snapshot.preferences.map(preference => [preference.key, preference.value]));
  if (initial || !state.lists.some(list => list.id === state.activeId)) {
    state.query = "";
    const selected = preferences.get("activeListId");
    state.activeId = typeof selected === "string" && state.lists.some(list => list.id === selected) ? selected : state.lists[0]?.id || null;
  }
  state.large = preferences.get("large") === true;
  render();
}

/** @param {(store: LocalStore) => Promise<void>} operation @returns {Promise<boolean>} */
function persist(operation) {
  if (!state.ready || !state.store) return Promise.resolve(false);
  const store = state.store;
  state.pending += 1;
  renderStatus();
  const task = writeQueue.then(async () => {
    try {
      await operation(store);
      state.failed = false;
      await refresh();
      channel?.postMessage({ changed: true });
      return true;
    } catch (error) {
      console.error("Lokaler Speicher:", error);
      state.failed = true;
      toast("Änderung konnte nicht gespeichert werden. Bitte erneut versuchen.");
      try { await refresh(); } catch { showFatal("Der lokale Speicher ist nicht verfügbar. Bitte prüfe die Browser-Einstellungen und lade die Seite neu."); }
      return false;
    } finally {
      state.pending -= 1;
      renderStatus();
    }
  });
  writeQueue = task.then(() => undefined);
  return task;
}

/** @param {string} name @returns {SVGSVGElement} */
function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("icon"); svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`); svg.append(use); return svg;
}

/** @param {ListItem} item @returns {HTMLLIElement} */
function renderItem(item) {
  const row = document.createElement("li");
  row.className = `list-row ${item.kind}-row${item.kind === "item" && item.checked ? " done" : ""}`;
  row.dataset.itemId = item.id;
  if (item.kind === "item") {
    const label = document.createElement("label"); label.className = "check-wrap";
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = item.checked;
    checkbox.dataset.action = "check";
    checkbox.disabled = !state.ready;
    checkbox.setAttribute("aria-label", `${item.text}: ${item.checked ? "als offen markieren" : "abhaken"}`);
    label.append(checkbox); row.append(label);
  }
  const edit = document.createElement("button"); edit.type = "button"; edit.dataset.action = "edit-item";
  edit.disabled = !state.ready;
  if (item.kind === "divider") {
    edit.className = "divider-content"; edit.setAttribute("aria-label", "Trennlinie bearbeiten"); edit.append(document.createElement("hr")); row.append(edit);
  } else {
    edit.className = "item-text"; edit.textContent = item.text; edit.setAttribute("aria-label", `${item.kind === "heading" ? "Überschrift" : "Eintrag"} bearbeiten: ${item.text}`);
    const content = document.createElement(item.kind === "heading" ? "h3" : "div"); content.classList.add("item-content"); content.append(edit); row.append(content);
  }
  const handle = document.createElement("button"); handle.type = "button"; handle.className = "drag-handle"; handle.dataset.action = "move-item";
  // Reordering requires the full list, otherwise hidden rows could move too.
  handle.disabled = !state.ready || !!state.query.trim();
  handle.setAttribute("aria-label", `${item.kind === "divider" ? "Trennlinie" : item.text} verschieben`);
  handle.setAttribute("aria-describedby", "drag-help"); handle.title = "Ziehen oder mit Pfeiltasten verschieben"; handle.append(icon("grip")); row.append(handle);
  return row;
}

function render() {
  const focused = document.activeElement;
  const focusedRow = focused instanceof HTMLElement ? focused.closest("[data-item-id]") : null;
  const focusId = focusedRow instanceof HTMLElement ? focusedRow.dataset.itemId : null;
  const focusAction = focused instanceof HTMLElement ? focused.dataset.action : null;
  const list = activeList();
  const items = visibleItems(list);
  const searching = !!state.query.trim();
  ui.shell.dataset.scale = state.large ? "large" : "normal";
  ui.shell.classList.toggle("is-searching", searching);
  ui.shell.setAttribute("aria-busy", String(!state.ready));
  ui.select.replaceChildren();
  if (!state.lists.length) {
    const option = new Option(state.ready ? "Keine Liste" : state.failed ? "Speicher nicht verfügbar" : "Wird geladen …", ""); ui.select.add(option);
  } else {
    for (const entry of state.lists) ui.select.add(new Option(entry.name, entry.id));
    ui.select.value = state.activeId || "";
  }
  /** @param {HTMLElement} control @param {boolean} disabled */
  const disable = (control, disabled) => { if ("disabled" in control) control.disabled = disabled; };
  disable(ui.select, !state.ready || !list);
  disable(ui.newList, !state.ready);
  disable(ui.menuToggle, !state.ready || !list);
  disable(ui.search, !state.ready || !list);
  if (ui.search.value !== state.query) ui.search.value = state.query;
  ui.searchClear.hidden = !state.query;
  ui.searchCount.hidden = !searching;
  ui.searchCount.textContent = searching ? `${items.length} Treffer` : "";
  const checks = items.filter(item => item.kind === "item");
  const checked = checks.filter(item => item.checked).length;
  const allChecked = checks.length > 0 && checked === checks.length;
  ui.allLabel.textContent = `${searching ? "Treffer" : "Alle"} ${allChecked ? "öffnen" : "abhaken"}`;
  const scope = searching ? "Gefundene Checkboxen" : "Alle Checkboxen";
  ui.all.setAttribute("aria-label", `${scope} ${allChecked ? "als offen markieren" : "abhaken"}`);
  ui.all.title = ui.all.getAttribute("aria-label") || "";
  ui.count.textContent = `${checked} / ${checks.length}`;
  disable(ui.all, !state.ready || !checks.length);
  ui.progress.style.width = `${checks.length ? checked / checks.length * 100 : 0}%`;
  ui.normal.setAttribute("aria-pressed", String(!state.large));
  ui.large.setAttribute("aria-pressed", String(state.large));
  for (const control of [ui.normal, ui.large]) disable(control, !state.ready);
  for (const control of [ui.item, ui.heading, ui.divider, ui.input, ui.add]) disable(control, !state.ready || !list);
  ui.list.replaceChildren(...items.map(renderItem));
  ui.empty.hidden = !state.ready || !!items.length;
  ui.emptyText.textContent = list ? searching ? `Keine Treffer für „${state.query.trim()}“` : "Noch keine Einträge" : "Noch keine Liste";
  ui.emptyCreate.hidden = !!list;
  ui.error.hidden = state.ready;
  renderStatus();
  if (focusId && focusAction) {
    const control = ui.list.querySelector(`[data-item-id="${focusId}"] [data-action="${focusAction}"]`);
    if (control instanceof HTMLElement) control.focus({ preventScroll: true });
  }
}

/** @param {'item' | 'heading'} kind */
function setKind(kind) {
  state.kind = kind;
  ui.item.setAttribute("aria-pressed", String(kind === "item"));
  ui.heading.setAttribute("aria-pressed", String(kind === "heading"));
  ui.input.placeholder = kind === "item" ? "Eintrag hinzufügen" : "Überschrift hinzufügen";
  ui.input.setAttribute("aria-label", kind === "item" ? "Neuer Eintrag" : "Neue Überschrift");
  ui.add.setAttribute("aria-label", kind === "item" ? "Eintrag hinzufügen" : "Überschrift hinzufügen");
  ui.input.focus();
}

/** @param {boolean} collapsed */
function setComposerCollapsed(collapsed) {
  state.composerCollapsed = collapsed;
  ui.composerPanel.classList.toggle("is-collapsed", collapsed);
  ui.composerGrip.setAttribute("aria-expanded", String(!collapsed));
  ui.composerGrip.setAttribute("aria-label", collapsed ? "Eingabeleiste ausklappen" : "Eingabeleiste einklappen");
  ui.composerGrip.title = collapsed ? "Zum Öffnen nach oben ziehen" : "Zum Einklappen nach unten ziehen";
  ui.composerContent.inert = collapsed;
}
setComposerCollapsed(state.composerCollapsed);

/** @param {PointerEvent} event */
function startComposerDrag(event) {
  if (event.button !== 0 || !event.isPrimary || composerDrag) return;
  composerDrag = { pointerId: event.pointerId, startY: event.clientY, y: event.clientY, moved: false };
  ui.composerGrip.setPointerCapture(event.pointerId);
}

/** @param {PointerEvent} event */
function moveComposerDrag(event) {
  const drag = composerDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag.y = event.clientY;
  const delta = drag.y - drag.startY;
  if (Math.abs(delta) >= 8) {
    drag.moved = true;
    ui.composerPanel.classList.add("is-dragging");
    const offset = state.composerCollapsed ? Math.min(0, delta) : Math.max(0, delta);
    ui.composerPanel.style.setProperty("--composer-drag-offset", `${offset}px`);
  }
}

/** @param {PointerEvent} event */
function finishComposerDrag(event) {
  const drag = composerDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  composerDrag = null;
  if (ui.composerGrip.hasPointerCapture(event.pointerId)) ui.composerGrip.releasePointerCapture(event.pointerId);
  const delta = drag.y - drag.startY;
  if (drag.moved) {
    ignoreComposerClick = true;
    if (Math.abs(delta) >= 36) setComposerCollapsed(delta > 0);
    ui.composerPanel.classList.remove("is-dragging");
    ui.composerPanel.style.removeProperty("--composer-drag-offset");
  }
}

/** @param {PointerEvent} event */
function cancelComposerDrag(event) {
  if (event.pointerId !== composerDrag?.pointerId) return;
  composerDrag = null;
  ui.composerPanel.classList.remove("is-dragging");
  ui.composerPanel.style.removeProperty("--composer-drag-offset");
}

/** @param {ItemKind} kind @param {string} [text] @returns {Promise<boolean>} */
async function addItem(kind, text = "") {
  const listId = state.activeId;
  if (!listId || (kind !== "divider" && !text.trim())) return false;
  const now = new Date().toISOString();
  /** @type {ListItem} */ const item = { id: uuid(), kind, text: text.trim(), checked: false, createdAt: now, updatedAt: now };
  const saved = await persist(store => store.update(listId, list => { list.items.push(item); }));
  if (saved && state.activeId === listId) {
    ui.viewport.scrollTop = ui.viewport.scrollHeight;
    announce(kind === "divider" ? "Trennlinie hinzugefügt" : `${item.text} hinzugefügt`);
  }
  return saved;
}

/** @param {boolean} open @param {boolean} [restoreFocus] */
function toggleMenu(open, restoreFocus = false) {
  ui.menu.hidden = !open; ui.menuToggle.setAttribute("aria-expanded", String(open));
  if (open) ui.menu.querySelector("button")?.focus();
  else if (restoreFocus) ui.menuToggle.focus();
}

/** @param {string} label @param {string} id @param {string} value @param {number} maxLength @returns {HTMLInputElement} */
function textField(label, id, value, maxLength) {
  const wrap = document.createElement("label"); wrap.className = "field";
  const title = document.createElement("span"); title.textContent = label;
  const input = document.createElement("input"); input.id = id; input.name = id; input.value = value; input.maxLength = maxLength; input.required = true; input.type = "text"; input.enterKeyHint = "done";
  wrap.append(title, input); ui.fields.append(wrap); return input;
}

/** @param {EditorContext} context */
function openEditor(context) {
  if (editorSaving) return;
  const list = state.lists.find(entry => entry.id === context.listId);
  const item = list?.items.find(entry => entry.id === context.itemId);
  if (context.mode !== "new-list" && !list) return;
  if ((context.mode === "edit-item" || context.mode === "delete-item") && !item) return;
  if (!ui.dialog.open) dialogReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  toggleMenu(false);
  state.editor = context; ui.fields.replaceChildren(); ui.dialogError.hidden = true; ui.save.disabled = false;
  ui.save.classList.remove("danger"); ui.save.textContent = "Speichern"; ui.remove.hidden = true;
  /** @type {HTMLInputElement | null} */ let input = null;
  if (context.mode === "new-list" || context.mode === "rename-list") {
    ui.dialogTitle.textContent = context.mode === "new-list" ? "Neue Liste" : "Liste umbenennen";
    input = textField("Listenname", "edit-name", context.mode === "new-list" ? "" : list?.name || "", 100);
    input.placeholder = "Zum Beispiel Wocheneinkauf";
    if (context.mode === "new-list") ui.save.textContent = "Anlegen";
  } else if (context.mode === "delete-list" || context.mode === "delete-item") {
    ui.dialogTitle.textContent = context.mode === "delete-list" ? "Liste löschen?" : "Element löschen?";
    const copy = document.createElement("p"); copy.className = "dialog-copy";
    const name = document.createElement("strong"); name.textContent = context.mode === "delete-list" ? list?.name || "" : item?.kind === "divider" ? "Trennlinie" : item?.text || "";
    copy.append(name, document.createTextNode(context.mode === "delete-list" ? " und alle enthaltenen Elemente werden aus diesem Browser gelöscht." : " wird aus dieser Liste gelöscht.")); ui.fields.append(copy);
    ui.save.textContent = "Löschen"; ui.save.classList.add("danger");
  } else if (item && list) {
    ui.dialogTitle.textContent = "Element bearbeiten";
    const wrap = document.createElement("label"); wrap.className = "field";
    const label = document.createElement("span"); label.textContent = "Elementtyp";
    const select = document.createElement("select"); select.id = "edit-kind"; select.name = "edit-kind";
    for (const [value, title] of [["item", "Checkbox-Eintrag"], ["heading", "Überschrift"], ["divider", "Trennlinie"]]) select.add(new Option(title, value));
    select.value = item.kind; wrap.append(label, select); ui.fields.append(wrap);
    input = textField("Text", "edit-text", item.text, 500);
    const inputWrap = input.parentElement;
    input.required = item.kind !== "divider";
    if (inputWrap) inputWrap.hidden = item.kind === "divider";
    select.addEventListener("change", () => {
      if (inputWrap) inputWrap.hidden = select.value === "divider";
      if (input) { input.required = select.value !== "divider"; if (input.required) input.focus(); }
    });
    const move = document.createElement("div"); move.className = "move-controls";
    for (const [delta, title, symbol] of [[-1, "Nach oben", "up"], [1, "Nach unten", "down"]]) {
      const button = document.createElement("button"); button.type = "button"; button.dataset.move = String(delta); button.append(icon(String(symbol)), document.createTextNode(String(title)));
      button.addEventListener("click", () => { void moveItem(list.id, item.id, Number(delta)); }); move.append(button);
    }
    ui.fields.append(move); updateMoveControls(); ui.remove.hidden = false;
  }
  if (!ui.dialog.open) ui.dialog.showModal();
  requestAnimationFrame(() => {
    if (input && input.required) { input.focus(); input.select(); }
    else if (context.mode.startsWith("delete")) ui.cancel.focus();
  });
}

function updateMoveControls() {
  const context = state.editor;
  const list = state.lists.find(entry => entry.id === context?.listId);
  const index = list?.items.findIndex(item => item.id === context?.itemId) ?? -1;
  for (const button of ui.fields.querySelectorAll("button[data-move]")) {
    if (button instanceof HTMLButtonElement) button.disabled = !!state.query.trim() || index < 0 || (button.dataset.move === "-1" ? index === 0 : index === (list?.items.length || 0) - 1);
  }
}

function closeEditor() {
  if (editorSaving) return;
  ui.dialog.close(); state.editor = null;
  if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus(); else ui.input.focus();
}

/** @returns {Promise<void>} */
async function submitEditor() {
  const context = state.editor;
  if (!context || ui.save.disabled) return;
  const data = new FormData(ui.form);
  const name = String(data.get("edit-name") || "").trim();
  const text = String(data.get("edit-text") || "").trim();
  const rawKind = data.get("edit-kind");
  const kind = /** @type {ItemKind} */ (["item", "heading", "divider"].includes(String(rawKind)) ? rawKind : "item");
  if (((context.mode === "new-list" || context.mode === "rename-list") && !name) || (context.mode === "edit-item" && kind !== "divider" && !text)) {
    ui.dialogError.textContent = "Bitte einen Text eingeben."; ui.dialogError.hidden = false; return;
  }
  ui.save.disabled = true;
  editorSaving = true;
  let success = false;
  if (context.mode === "new-list") {
    const list = makeList(name);
    success = await persist(async store => { await store.create(list); state.activeId = list.id; state.query = ""; });
  } else if (context.mode === "delete-list" && context.listId) {
    success = await persist(store => store.remove(/** @type {string} */ (context.listId)));
  } else if (context.listId) {
    success = await persist(store => store.update(/** @type {string} */ (context.listId), list => {
      if (context.mode === "rename-list") list.name = name;
      else if (context.mode === "delete-item") list.items = list.items.filter(item => item.id !== context.itemId);
      else {
        const item = list.items.find(entry => entry.id === context.itemId);
        if (item) { item.kind = kind; item.text = kind === "divider" ? "" : text; if (kind !== "item") item.checked = false; item.updatedAt = new Date().toISOString(); }
      }
    }));
  }
  ui.save.disabled = false;
  editorSaving = false;
  if (success) { closeEditor(); if (context.mode.startsWith("delete")) toast(context.mode === "delete-list" ? "Liste gelöscht" : "Element gelöscht"); }
  else { ui.dialogError.textContent = "Speichern fehlgeschlagen. Deine Eingabe bleibt erhalten."; ui.dialogError.hidden = false; }
}

/** @param {string} listId @param {string} itemId @param {number} delta @returns {Promise<void>} */
async function moveItem(listId, itemId, delta) {
  const success = await persist(store => store.update(listId, list => {
    const index = list.items.findIndex(item => item.id === itemId);
    const destination = index + delta;
    if (index < 0 || destination < 0 || destination >= list.items.length) return;
    const [item] = list.items.splice(index, 1); list.items.splice(destination, 0, item);
  }));
  if (success) {
    updateMoveControls();
    const list = state.lists.find(entry => entry.id === listId);
    const position = list?.items.findIndex(item => item.id === itemId) ?? -1;
    announce(`Element an Position ${position + 1} verschoben`);
    if (!ui.dialog.open) {
      const handle = ui.list.querySelector(`[data-item-id="${itemId}"] .drag-handle`);
      if (handle instanceof HTMLElement) { handle.focus(); handle.scrollIntoView({ block: "nearest" }); }
    }
  }
}

/** @param {PointerEvent} event */
function startDrag(event) {
  const target = event.target instanceof Element ? event.target.closest(".drag-handle") : null;
  if (!(target instanceof HTMLButtonElement) || target.disabled || event.button !== 0 || !event.isPrimary || state.pending || state.drag || !state.ready || !state.activeId) return;
  const row = target.closest("li");
  if (!(row instanceof HTMLLIElement) || !row.dataset.itemId) return;
  // Keep capture on the stable container: moving the captured row itself can
  // release pointer capture in Safari and Chromium while reordering the DOM.
  event.preventDefault(); ui.list.setPointerCapture(event.pointerId);
  state.drag = { pointerId: event.pointerId, handle: target, row, listId: state.activeId, itemId: row.dataset.itemId, startY: event.clientY, y: event.clientY, offsetY: event.clientY - row.getBoundingClientRect().top, started: false, preview: null, frame: 0, originalIds: Array.from(ui.list.children, child => /** @type {HTMLElement} */ (child).dataset.itemId || "") };
}

function dragFrame() {
  const drag = state.drag;
  if (!drag?.started) return;
  const viewport = ui.viewport.getBoundingClientRect();
  const edge = 52;
  if (drag.y < viewport.top + edge) ui.viewport.scrollTop -= Math.min(14, (viewport.top + edge - drag.y) / 4);
  else if (drag.y > viewport.bottom - edge) ui.viewport.scrollTop += Math.min(14, (drag.y - viewport.bottom + edge) / 4);
  if (drag.preview) drag.preview.style.top = `${drag.y - drag.offsetY}px`;
  const rows = Array.from(ui.list.children).filter(row => row !== drag.row);
  const before = rows.find(row => { const rect = row.getBoundingClientRect(); return drag.y < rect.top + rect.height / 2; });
  if (before) { if (drag.row.nextElementSibling !== before) ui.list.insertBefore(drag.row, before); }
  else if (ui.list.lastElementChild !== drag.row) ui.list.append(drag.row);
  drag.frame = requestAnimationFrame(dragFrame);
}

/** @param {PointerEvent} event */
function updateDrag(event) {
  const drag = state.drag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  event.preventDefault(); drag.y = event.clientY;
  if (!drag.started && Math.abs(drag.y - drag.startY) >= 6) {
    drag.started = true;
    const rect = drag.row.getBoundingClientRect();
    const preview = /** @type {HTMLLIElement} */ (drag.row.cloneNode(true));
    preview.classList.add("drag-preview"); preview.setAttribute("aria-hidden", "true"); preview.inert = true;
    preview.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;min-height:${rect.height}px;--scale:${state.large ? 1.5 : 1}`;
    document.body.append(preview); drag.preview = preview;
    drag.row.classList.add("is-dragging"); document.body.classList.add("dragging");
    drag.frame = requestAnimationFrame(dragFrame); announce("Element wird verschoben");
  }
}

/** @param {boolean} cancel */
async function finishDrag(cancel) {
  const drag = state.drag;
  if (!drag) return;
  const ids = Array.from(ui.list.children, row => /** @type {HTMLElement} */ (row).dataset.itemId || "");
  cancelAnimationFrame(drag.frame); drag.preview?.remove(); drag.row.classList.remove("is-dragging"); document.body.classList.remove("dragging");
  state.drag = null; ignoreClickUntil = Date.now() + 350;
  if (ui.list.hasPointerCapture(drag.pointerId)) ui.list.releasePointerCapture(drag.pointerId);
  if (cancel) { render(); announce("Verschieben abgebrochen"); }
  else if (!drag.started) openEditor({ mode: "edit-item", listId: drag.listId, itemId: drag.itemId });
  else if (ids.join() !== drag.originalIds.join()) {
    const rank = new Map(ids.map((id, index) => [id, index]));
    const success = await persist(store => store.update(drag.listId, list => { list.items.sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER)); }));
    if (success) announce("Reihenfolge gespeichert");
  }
  if (state.refreshPending) { state.refreshPending = false; try { await refresh(); } catch { toast("Lokaler Speicher konnte nicht neu geladen werden."); } }
}

ui.newList.addEventListener("click", () => openEditor({ mode: "new-list", listId: null }));
ui.emptyCreate.addEventListener("click", () => openEditor({ mode: "new-list", listId: null }));
ui.select.addEventListener("change", () => {
  state.activeId = ui.select.value; state.query = ""; ui.input.value = ""; toggleMenu(false); render(); ui.viewport.scrollTop = 0;
  void persist(store => store.preference("activeListId", state.activeId));
});
ui.search.addEventListener("input", () => {
  if (state.drag) void finishDrag(true);
  state.query = ui.search.value; render(); ui.viewport.scrollTop = 0;
});
ui.searchClear.addEventListener("click", () => { clearSearch(); ui.search.focus(); });
ui.searchForm.addEventListener("submit", event => { event.preventDefault(); ui.search.blur(); });
ui.menuToggle.addEventListener("click", () => toggleMenu(ui.menu.hidden));
ui.menu.addEventListener("click", event => {
  const button = event.target instanceof Element ? event.target.closest("[data-action]") : null;
  if (!(button instanceof HTMLElement)) return;
  openEditor({ mode: button.dataset.action === "rename-list" ? "rename-list" : "delete-list", listId: state.activeId });
});
document.addEventListener("click", event => { if (event.target instanceof Node && !ui.menu.parentElement?.contains(event.target)) toggleMenu(false); });
ui.menu.addEventListener("keydown", event => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault(); const buttons = Array.from(ui.menu.querySelectorAll("button"));
    const current = buttons.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    buttons[(current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }
});
ui.all.addEventListener("click", () => {
  const list = activeList(); if (!list) return;
  const checks = visibleItems(list).filter(item => item.kind === "item");
  const ids = new Set(checks.map(item => item.id));
  const checked = !checks.every(item => item.checked);
  void persist(store => store.update(list.id, current => { for (const item of current.items) if (item.kind === "item" && ids.has(item.id)) { item.checked = checked; item.updatedAt = new Date().toISOString(); } }));
});
for (const [button, large] of [[ui.normal, false], [ui.large, true]]) {
  if (button instanceof HTMLElement) button.addEventListener("click", () => { void persist(store => store.preference("large", large)); });
}
ui.item.addEventListener("click", () => setKind("item"));
ui.heading.addEventListener("click", () => setKind("heading"));
ui.divider.addEventListener("click", () => { void addItem("divider"); });
ui.composer.addEventListener("submit", event => {
  event.preventDefault(); const text = ui.input.value;
  if (!text.trim()) { ui.input.focus(); return; }
  // Clear immediately so repeated Enter presses cannot enqueue the same draft.
  ui.input.value = "";
  void addItem(state.kind, text).then(saved => { if (!saved && !ui.input.value) ui.input.value = text; });
  ui.input.focus();
});
ui.composerGrip.addEventListener("pointerdown", startComposerDrag);
ui.composerGrip.addEventListener("pointermove", moveComposerDrag);
ui.composerGrip.addEventListener("pointerup", finishComposerDrag);
ui.composerGrip.addEventListener("pointercancel", cancelComposerDrag);
ui.composerGrip.addEventListener("lostpointercapture", cancelComposerDrag);
ui.composerGrip.addEventListener("click", event => {
  if (ignoreComposerClick) { ignoreComposerClick = false; event.preventDefault(); return; }
  setComposerCollapsed(!state.composerCollapsed);
});
ui.list.addEventListener("change", event => {
  const checkbox = event.target;
  if (!(checkbox instanceof HTMLInputElement)) return;
  const row = checkbox.closest("li"); const itemId = row?.dataset.itemId; const listId = state.activeId;
  if (!itemId || !listId) return;
  const checked = checkbox.checked;
  void persist(store => store.update(listId, list => { const item = list.items.find(entry => entry.id === itemId); if (item?.kind === "item") { item.checked = checked; item.updatedAt = new Date().toISOString(); } }));
});
ui.list.addEventListener("click", event => {
  if (Date.now() < ignoreClickUntil) return;
  const button = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
  if (!(button instanceof HTMLButtonElement)) return;
  const itemId = button.closest("li")?.dataset.itemId;
  if (itemId) openEditor({ mode: "edit-item", listId: state.activeId, itemId });
});
ui.list.addEventListener("keydown", event => {
  const handle = event.target;
  if (!(handle instanceof HTMLButtonElement) || handle.disabled || !handle.classList.contains("drag-handle") || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault(); const id = handle.closest("li")?.dataset.itemId;
  if (id && state.activeId) void moveItem(state.activeId, id, event.key === "ArrowUp" ? -1 : 1);
});
ui.list.addEventListener("pointerdown", startDrag);
ui.list.addEventListener("pointermove", updateDrag);
ui.list.addEventListener("pointerup", event => { if (event.pointerId === state.drag?.pointerId) void finishDrag(false); });
ui.list.addEventListener("pointercancel", event => { if (event.pointerId === state.drag?.pointerId) void finishDrag(true); });
ui.list.addEventListener("lostpointercapture", event => { if (event.pointerId === state.drag?.pointerId) void finishDrag(true); });
document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  if (state.drag) { event.preventDefault(); void finishDrag(true); }
  else if (!ui.menu.hidden) { event.preventDefault(); toggleMenu(false, true); }
  else if (document.activeElement === ui.search && state.query) { event.preventDefault(); clearSearch(); }
});
ui.form.addEventListener("submit", event => { event.preventDefault(); void submitEditor(); });
ui.cancel.addEventListener("click", closeEditor); ui.close.addEventListener("click", closeEditor);
ui.dialog.addEventListener("cancel", event => { event.preventDefault(); closeEditor(); });
ui.remove.addEventListener("click", () => { const context = state.editor; if (context) openEditor({ mode: "delete-item", listId: context.listId, itemId: context.itemId }); });
ui.retry.addEventListener("click", () => { location.reload(); });

async function refreshOtherTab() {
  if (!state.ready || state.pending) return;
  try { await refresh(); updateMoveControls(); } catch { toast("Lokaler Speicher konnte nicht neu geladen werden."); }
}
channel?.addEventListener("message", () => { void refreshOtherTab(); });
window.addEventListener("focus", () => { void refreshOtherTab(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) void refreshOtherTab(); });

const mobileLandscape = window.matchMedia("(orientation: landscape) and (max-width: 1024px), (orientation: landscape) and (pointer: coarse)");
function updateOrientation() {
  ui.landscape.hidden = !mobileLandscape.matches;
  ui.shell.inert = mobileLandscape.matches;
  if (mobileLandscape.matches) { if (state.drag) void finishDrag(true); if (ui.dialog.open) closeEditor(); toggleMenu(false); }
}
mobileLandscape.addEventListener("change", updateOrientation); updateOrientation();

// The visual viewport follows the on-screen keyboard on iOS and Android.
// Native pinch zoom remains available and keeps the browser's own layout.
function updateViewport() {
  const viewport = window.visualViewport;
  if (viewport && viewport.scale === 1) {
    document.documentElement.style.setProperty("--app-height", `${viewport.height}px`);
    document.documentElement.style.setProperty("--viewport-top", `${viewport.offsetTop}px`);
  } else {
    document.documentElement.style.removeProperty("--app-height");
    document.documentElement.style.removeProperty("--viewport-top");
  }
}
window.visualViewport?.addEventListener("resize", updateViewport);
window.visualViewport?.addEventListener("scroll", updateViewport);
window.addEventListener("resize", updateViewport);
updateViewport();

async function initialize() {
  try {
    state.store = await LocalStore.open();
    await state.store.initialize();
    state.ready = true;
    await refresh(true);
  } catch (error) {
    console.error("IndexedDB:", error);
    showFatal("Lokaler Speicher nicht verfügbar. Bitte erlaube Websitedaten in den Browser-Einstellungen und lade die Seite neu.");
  }
}
void initialize();
