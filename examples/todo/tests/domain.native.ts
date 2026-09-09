import { InMemoryTodoRepository } from "../src/todos/inMemoryTodoRepository";
import { TodoService } from "../src/todos/todoService";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const first = new TodoService(new InMemoryTodoRepository().port());
const second = new TodoService(new InMemoryTodoRepository().port());
const created = first.create("  one  ");
assert(created.title === "one", "Title normalization");
created.title = "modified";
const snapshot = first.list();
snapshot[0]!.completed = true;
snapshot.push({ id: 999, title: "injected", completed: false });
assert(first.list().length === 1, "Array ownership");
assert(first.list()[0]!.title === "one", "Create snapshot ownership");
assert(first.list()[0]!.completed === false, "List snapshot ownership");
assert(second.list().length === 0, "Repository instance isolation");
const updated = first.update(1, "two", true);
assert(updated !== null, "Update existing record");
if (updated !== null) updated.title = "mutated";
assert(first.list()[0]!.title === "two", "Update snapshot ownership");
let invalid = false;
try { first.update(1, " ", false); } catch { invalid = true; }
assert(invalid && first.list()[0]!.completed, "Invalid update must not mutate");

console.log("PASS native Todo domain contracts");

first.create("Alpha");
first.create("beta");
const page = first.search({ q: "A", status: "active", offset: 1, limit: 1 });
assert(page.total === 2 && page.items.length === 1 && page.items[0]!.title === "beta", "Filtered pagination");
assert(first.search({ q: "", status: "completed", offset: 0, limit: 0 }).total === 1, "Status filtering");
assert(first.search({ q: "", status: "all", offset: 99, limit: 10 }).items.length === 0, "Offset past end");
assert(first.get(999) === null, "Missing detail");
