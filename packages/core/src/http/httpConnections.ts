import type { Socket } from "node:net";

class Connection {
  active = 0;
  constructor(public socket: Socket) {}
}

/** HTTP/1 连接所有权；请求只在响应完成或连接关闭后退出活动状态。 */
export class HttpConnections {
  private connections: Connection[] = [];
  draining = false;
  forced = false;

  track(socket: Socket): void {
    if (this.connections.some((item) => item.socket === socket)) return;
    const connection = new Connection(socket);
    this.connections.push(connection);
    socket.on("close", () => {
      const index = this.connections.indexOf(connection);
      if (index >= 0) this.connections.splice(index, 1);
    });
    if (this.draining) socket.destroy();
  }

  begin(socket: Socket): () => void {
    this.track(socket);
    const connection = this.connections.find((item) => item.socket === socket);
    if (!connection) throw new Error("HTTP connection is unavailable");
    connection.active += 1;
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      connection.active -= 1;
      // 平滑结束写入，保留底层发送队列；destroy 会截断尚未送达的大响应。
      if (this.draining && connection.active === 0) socket.end();
    };
  }

  drainIdle(): void {
    this.draining = true;
    for (const connection of this.connections.slice()) {
      if (connection.active === 0) connection.socket.end();
    }
  }

  forceClose(): void {
    this.forced = true;
    for (const connection of this.connections.slice()) connection.socket.destroy();
  }
}
