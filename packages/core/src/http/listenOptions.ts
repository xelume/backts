/** host 省略或 false 使用 localhost，true 使用 0.0.0.0，字符串指定监听地址。 */
export interface ListenOptions { host?: string | boolean; port: number; }
export interface ResolvedListenOptions { host: string; port: number; }

export function resolveListenOptions(input: number | ListenOptions, host?: string | boolean): ResolvedListenOptions {
  if (typeof input !== "number" && host !== undefined) throw new Error("Do not mix object and positional options");
  const port = typeof input === "number" ? input : input.port;
  const value = typeof input === "number" ? host : input.host;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port");
  const address = value === undefined || value === false ? "localhost" : value === true ? "0.0.0.0" : value;
  if (address.length === 0 || address.trim() !== address) throw new Error("Invalid host");
  return { host: address, port };
}
