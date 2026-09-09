import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { expect, withServer } from "./nativeServer.ts";

test("native static files preserve bytes and enforce routing and filesystem boundaries", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "scriptc-static-"));
  const directory = join(temporary, "public");
  mkdirSync(join(directory, "nested"), { recursive: true });
  mkdirSync(join(directory, "empty"));
  const picture = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZf8AAAAASUVORK5CYII=", "base64");
  writeFileSync(join(directory, "index.html"), "<h1>Static</h1>");
  writeFileSync(join(directory, "nested/index.html"), "nested index");
  writeFileSync(join(directory, "image.png"), picture);
  writeFileSync(join(directory, "hello 世界.txt"), "你好 static");
  writeFileSync(join(directory, "app.js"), "console.log('ok')");
  writeFileSync(join(directory, "styles.css"), "body { color: red }");
  writeFileSync(join(directory, "unknown.bin"), Buffer.from([0, 255, 128]));
  writeFileSync(join(directory, "override.txt"), "must not serve");
  writeFileSync(join(directory, "business.txt"), "must not serve");
  writeFileSync(join(directory, ".env"), "SECRET");
  writeFileSync(join(temporary, "outside.txt"), "OUTSIDE");
  symlinkSync(join(temporary, "outside.txt"), join(directory, "escape.txt"));
  symlinkSync(temporary, join(directory, "escapeDirectory"));
  symlinkSync(join(directory, ".env"), join(directory, "hiddenAlias.txt"));
  symlinkSync(join(directory, "image.png"), join(directory, "inside.png"));
  try {
    await withServer("packages/core/.scriptc/staticServer", async (port) => {
      assert.equal((await expect(port, "GET", "/", 200)).body, "<h1>Static</h1>");
      const image = await expect(port, "GET", "/assets/image.png?cache=1", 200);
      assert.deepEqual(image.rawBody, picture);
      assert.equal(image.headers["content-type"], "image/png");
      assert.equal(image.headers["content-length"], String(picture.length));
      assert.equal(image.headers["cache-control"], "no-cache");
      assert.equal(image.headers["x-content-type-options"], "nosniff");
      const head = await expect(port, "HEAD", "/assets/image.png", 200);
      assert.equal(head.rawBody.length, 0);
      assert.equal(head.headers["content-length"], image.headers["content-length"]);
      assert.equal((await expect(port, "GET", "/assets/hello%20%E4%B8%96%E7%95%8C.txt", 200)).body, "你好 static");
      assert.match((await expect(port, "GET", "/assets/app.js", 200)).headers["content-type"]!, /javascript/);
      assert.match((await expect(port, "GET", "/assets/styles.css", 200)).headers["content-type"]!, /text\/css/);
      assert.equal((await expect(port, "GET", "/assets/unknown.bin", 200)).headers["content-type"], "application/octet-stream");
      assert.equal((await expect(port, "GET", "/assets", 308)).headers.location, "/assets/");
      assert.equal((await expect(port, "GET", "/assets/nested/", 200)).body, "nested index");
      assert.deepEqual((await expect(port, "GET", "/assets/inside.png", 200)).rawBody, picture);
      assert.deepEqual(JSON.parse((await expect(port, "GET", "/assets/override.txt", 200)).body), { route: true });
      assert.equal(JSON.parse((await expect(port, "GET", "/assets/business.txt", 404)).body).error, "Business missing");
      assert.equal((await expect(port, "POST", "/assets/override.txt", 405)).headers.allow, "GET");
      assert.equal((await expect(port, "POST", "/assets/image.png", 405)).headers.allow, "GET, HEAD");
      for (const path of ["/assets/no-file", "/assets/empty/", "/assetsx/image.png", "/assets/../outside.txt", "/assets/%2e%2e/outside.txt", "/assets/%2e%2e%2foutside.txt", "/assets/%5c..%5coutside.txt", "/assets/%00", "/assets/.env", "/assets/%2eenv", "/assets/escape.txt", "/assets/escapeDirectory/outside.txt", "/assets/hiddenAlias.txt", "/assets/nested/image.png"]) {
        await expect(port, "GET", path, 404);
      }
      await expect(port, "GET", "/assets/%ZZ", 400);
      await expect(port, "GET", "//assets/", 400);
    }, "SIGTERM", null, [directory]);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
