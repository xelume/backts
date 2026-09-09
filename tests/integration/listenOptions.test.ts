import { test } from "node:test";
import { expect, withServer } from "./nativeServer.ts";

for (const api of ["run", "listen"]) {
  for (const form of ["number", "true", "false", "string", "object", "objectTrue", "objectFalse", "wildcard"]) {
    test(`${api} accepts ${form} configuration in native runtime`, async () => {
      await withServer("packages/core/.scriptc/listenOptions", async (port) => {
        await expect(port, "GET", "/health", 200);
      }, "SIGTERM", null, [api, form]);
    });
  }
}
