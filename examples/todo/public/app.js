const form = document.querySelector("#create-form");
const titleInput = document.querySelector("#todo-title");
const todoList = document.querySelector("#todo-list");
const todoCount = document.querySelector("#todo-count");
const status = document.querySelector("#status");
const template = document.querySelector("#todo-template");
const filterForm = document.querySelector("#filter-form");
const search = document.querySelector("#search");
const filterStatus = document.querySelector("#filter-status");
const previous = document.querySelector("#previous");
const next = document.querySelector("#next");
const pageLabel = document.querySelector("#page-label");
const retry = document.querySelector("#retry");
const pageSize = 10;
let offset = 0;
let total = 0;
let todos = [];
let busy = false;
let loading = false;
let generation = 0;
let loadingRequest;
let filters = { q: "", status: "all" };

async function request(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error ?? `HTTP ${response.status}`);
  }
  return { data: response.status === 204 ? null : await response.json(), response };
}

function setStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function controls() {
  for (const input of document.querySelectorAll("#create-form input, #create-form button, #filter-form input, #filter-form select, #filter-form button")) input.disabled = busy;
  for (const input of todoList.querySelectorAll("input, button")) input.disabled = busy || loading;
  previous.disabled = busy || loading || offset === 0;
  next.disabled = busy || loading || offset + pageSize >= total;
  retry.disabled = busy || loading;
  todoList.setAttribute("aria-busy", String(busy || loading));
}

function renderTodos() {
  todoList.replaceChildren();
  todoCount.textContent = `${total} ${total === 1 ? "item" : "items"}`;
  pageLabel.textContent = `Page ${Math.floor(offset / pageSize) + 1} of ${Math.max(1, Math.ceil(total / pageSize))}`;
  for (const todo of todos) {
    const item = template.content.firstElementChild.cloneNode(true);
    const toggle = item.querySelector(".todo-toggle");
    const edit = item.querySelector(".todo-edit");
    item.classList.toggle("completed", todo.completed);
    toggle.checked = todo.completed;
    edit.value = todo.title;
    toggle.setAttribute("aria-label", `Complete ${todo.title}`);
    toggle.addEventListener("change", () => mutate(`/api/todos/${todo.id}`, "PATCH", { completed: toggle.checked }));
    edit.addEventListener("change", () => {
      const title = edit.value.trim();
      if (!title) { edit.value = todo.title; setStatus("Title cannot be empty.", true); return; }
      if (title !== todo.title) void mutate(`/api/todos/${todo.id}`, "PATCH", { title });
    });
    item.querySelector(".delete-button").addEventListener("click", () => mutate(`/api/todos/${todo.id}`, "DELETE"));
    todoList.append(item);
  }
  controls();
}

async function loadTodos(saved = false) {
  const current = ++generation;
  loadingRequest?.abort();
  loadingRequest = new AbortController();
  loading = true;
  retry.hidden = true;
  setStatus("Loading…");
  controls();
  const query = new URLSearchParams({ ...filters, limit: String(pageSize), offset: String(offset) });
  try {
    const result = await request(`/api/todos?${query}`, { signal: loadingRequest.signal });
    if (current !== generation) return;
    total = Number(result.response.headers.get("x-total-count"));
    if (offset > 0 && offset >= total) {
      offset = Math.max(0, (Math.ceil(total / pageSize) - 1) * pageSize);
      return await loadTodos(saved);
    }
    todos = result.data;
    renderTodos();
    setStatus(total === 0 ? (filters.q || filters.status !== "all" ? "No matching tasks. Try another filter." : "No tasks yet. Add your first task above.") : (saved ? "Saved." : ""));
  } catch (error) {
    if (current !== generation || error.name === "AbortError") return;
    setStatus(`${saved ? "Saved, but the list could not refresh. " : ""}${error.message}`, true);
    retry.hidden = false;
  } finally {
    if (current === generation) { loading = false; controls(); }
  }
}

async function mutate(path, method, body) {
  if (busy) return;
  busy = true;
  ++generation;
  loadingRequest?.abort();
  loading = false;
  retry.hidden = true;
  controls();
  setStatus("Saving…");
  try {
    await request(path, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
    if (method === "POST") form.reset();
    await loadTodos(true);
  } catch (error) {
    renderTodos();
    setStatus(error.message, true);
  } finally {
    busy = false;
    controls();
    if (method === "POST") titleInput.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (title) void mutate("/api/todos", "POST", { title });
});
filterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy) return;
  filters = { q: search.value.trim(), status: filterStatus.value };
  offset = 0;
  void loadTodos();
});
previous.addEventListener("click", () => { offset = Math.max(0, offset - pageSize); void loadTodos(); });
next.addEventListener("click", () => { offset += pageSize; void loadTodos(); });
retry.addEventListener("click", () => { void loadTodos(); });
await loadTodos();
