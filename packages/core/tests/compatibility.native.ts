import { createServer } from "node:http";

interface Counter {
  next(): number;
}

class MemoryCounter implements Counter {
  private value = 0;
  next(): number {
    this.value += 1;
    return this.value;
  }
}

class Service {
  constructor(private counter: Counter) {}
  async read(): Promise<number> {
    return this.counter.next();
  }
}

const counter = new MemoryCounter();
const service = new Service({ next: () => counter.next() });
const read = async (): Promise<number> => service.read();
if (await read() !== 1 || await read() !== 2) throw new Error("Object dispatch failed");
const server = createServer((_request, response) => response.end("ok"));
server.listen(0, "127.0.0.1", () => {
  server.close(() => console.log("compatibility ok"));
});
