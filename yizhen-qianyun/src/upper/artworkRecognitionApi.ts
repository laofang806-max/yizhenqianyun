import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

export function artworkRecognitionApi(): Plugin {
  let running = 0;
  const middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (new URL(request.url ?? "/", "http://localhost").pathname !== "/api/artwork/recognize") { next(); return; }
    const reply = (status: number, data: unknown) => {
      if (response.destroyed || response.writableEnded) return;
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify(data));
    };
    if (request.method !== "POST") { reply(405, { error: "Only POST is supported" }); return; }
    if (request.headers.origin) {
      try { if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(request.headers.origin).hostname)) { reply(403, { error: "Local requests only" }); return; } }
      catch { reply(403, { error: "Invalid origin" }); return; }
    }
    if (running >= 2) { reply(429, { error: "图像处理繁忙，请稍后重试。" }); return; }
    running++;
    void (async () => {
      try {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of request) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length;
          if (size > 3_000_000) { reply(413, { error: "图像请求过大。" }); return; }
          chunks.push(bytes);
        }
        const python = process.env.ARTWORK_PYTHON || "python";
        const program = resolve(process.cwd(), "../host/recognize_artwork.py");
        await new Promise<void>((done) => {
          const child = spawn(python, [program], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
          let output = "";
          const timeout = setTimeout(() => { child.kill(); reply(504, { error: "图像匹配超时，可重试或使用普通路径生成。" }); }, 20000);
          response.on("close", () => { if (!response.writableEnded) child.kill(); });
          child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); if (output.length > 100000) child.kill(); });
          child.stderr.on("data", () => undefined);
          child.on("error", () => { clearTimeout(timeout); reply(503, { error: "本地图像匹配服务不可用，可使用普通路径生成。" }); done(); });
          child.on("close", (code) => {
            clearTimeout(timeout);
            try { const body: unknown = JSON.parse(output); reply(code === 0 ? 200 : 422, body); }
            catch { reply(502, { error: "无法解析图像匹配结果。" }); }
            done();
          });
          child.stdin.on("error", () => undefined);
          child.stdin.end(Buffer.concat(chunks));
        });
      } catch { reply(400, { error: "无法读取图像请求。" }); }
      finally { running--; }
    })();
  };
  return {
    name: "local-artwork-registration",
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
