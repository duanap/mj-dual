// 联机服务入口：静态托管 demo 前端 + Socket.IO 网关（同源，无 CORS）。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { RoomManager } from './rooms';
import { attachGateway } from './gateway';

const PORT = Number(process.env.PORT ?? 8788);
const AUTO_MS = Number(process.env.MJ_AUTO_MS ?? 20_000);
const SWEEP_MS = 60_000;

const demoDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../engine/demo');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

export function createApp() {
  const httpServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, rooms: manager.size() }));
        return;
      }
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/index.html';
      const file = resolve(demoDir, `.${pathname}`);
      if (!file.startsWith(demoDir)) throw new Error('forbidden');
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
    }
  });

  const io = new Server(httpServer, { serveClient: false });
  const manager = new RoomManager();
  attachGateway(io, manager, { autoMs: AUTO_MS });
  const sweep = setInterval(() => manager.sweep(), SWEEP_MS);
  return { httpServer, io, manager, stop: () => { clearInterval(sweep); io.close(); httpServer.close(); } };
}

// 直接运行（被测试导入时不监听）
if (process.env.MJ_NO_LISTEN !== '1') {
  const app = createApp();
  app.httpServer.listen(PORT, () => {
    console.log(`联机服务: http://localhost:${PORT}（前端同源托管；超时托管 ${AUTO_MS}ms）`);
  });
}
