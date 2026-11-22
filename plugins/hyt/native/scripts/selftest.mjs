#!/usr/bin/env node
// 本地自测：拉起 bridge 进程，走一遍不需要登录的只读 RPC。
// 用法：
//   node scripts/selftest.mjs                     # 用默认 build/bin 与真实 ~/Documents/CHFile
//   node scripts/selftest.mjs --port 37299        # 指定端口
//   node scripts/selftest.mjs --bin path/to/bin   # 指定可执行文件
//   node scripts/selftest.mjs --no-spawn          # 连接已在运行的实例
// 不发送任何消息、不做登录。
import { spawn } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const root = path.resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);

function arg(name, fallback) {
  const i = argv.indexOf("--" + name);
  if (i === -1) return fallback;
  const value = argv[i + 1];
  return value && !value.startsWith("--") ? value : true;
}

const bin = arg("bin", path.join(root, "build/bin/hyt-native-bridge"));
const port = Number(arg("port", 37299));
const noSpawn = arg("no-spawn", false) === true;
const chRoot = arg("ch-root", process.env.HYT_CH_ROOT || path.join(os.homedir(), "Documents", "CHFile"));

let nextId = 1;
let socket = null;
let buffer = "";
const pending = new Map();

function call(method, params = {}, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} 超时（${timeoutMs}ms）`));
    }, timeoutMs);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      if (msg.error) reject(new Error(`${method}: ${msg.error.message || JSON.stringify(msg.error)}`));
      else resolve(msg.result);
    });
    socket.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

function connect() {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: "127.0.0.1", port }, () => resolve(sock));
    sock.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let pos;
      while ((pos = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, pos).trim();
        buffer = buffer.slice(pos + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id != null && pending.has(msg.id)) {
          const done = pending.get(msg.id);
          pending.delete(msg.id);
          done(msg);
        }
      }
    });
    sock.on("error", reject);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let child = null;
let restoreBridgeInfo = null;

function backupBridgeInfo() {
  const file = path.join(chRoot, "Config", "bridge.json");
  if (!fs.existsSync(file)) return;
  const original = fs.readFileSync(file, "utf8");
  restoreBridgeInfo = () => {
    try {
      fs.writeFileSync(file, original);
    } catch {
      // 恢复失败只影响下次启动的提示，忽略。
    }
  };
}

async function main() {
  if (!noSpawn && !fs.existsSync(bin)) {
    throw new Error(`找不到可执行文件：${bin}（先运行 scripts/build-macos.sh）`);
  }
  if (!noSpawn) {
    backupBridgeInfo();
    child = spawn(bin, ["--port", String(port)], {
      env: { ...process.env, HYT_CH_ROOT: chRoot },
      // EC SDK 初始化会往 stdout 打大量内容，接管道不读会堵住子进程。
      stdio: ["ignore", "ignore", "pipe"],
    });
    child.stderr.on("data", (chunk) => process.stderr.write("[bridge] " + chunk));
  }

  // EC SDK 初始化会阻塞数秒，监听在它之后才建立。
  let lastError = null;
  for (let i = 0; i < 120; i++) {
    try {
      socket = await connect();
      break;
    } catch (error) {
      lastError = error;
      await sleep(150);
    }
  }
  if (!socket) throw new Error(`连接 127.0.0.1:${port} 失败：${lastError?.message}`);

  const results = [];
  const record = (name, ok, detail) => {
    results.push({ name, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  };

  const pong = await call("ping");
  record("ping", pong?.pong === true, `ts=${pong?.ts}`);

  const info = await call("bridge.info");
  record(
    "bridge.info",
    info?.name === "hyt-native-bridge",
    `v=${info?.version} platform=${info?.platform} available=${info?.available} store=${info?.store || "(未打开)"}`,
  );

  const state = await call("auth.state");
  record("auth.state", typeof state?.available === "boolean", `loggedIn=${state?.loggedIn} connected=${state?.connected}`);

  const sessions = await call("im.sessions", { limit: 5 });
  const sessionList = sessions?.sessions || [];
  record("im.sessions", Array.isArray(sessionList), `count=${sessionList.length}`);

  if (sessionList.length > 0) {
    const sessionId = sessionList[0].sessionId;
    const history = await call("im.history", { sessionId, limit: 5 });
    const messages = history?.messages || [];
    record("im.history", Array.isArray(messages), `sessionId=${sessionId} count=${messages.length} hasMore=${history?.hasMore}`);
  }

  const groups = await call("im.groups");
  record("im.groups", Array.isArray(groups?.groups), `count=${groups?.groups?.length ?? 0}`);

  const merges = [];
  for (const session of sessionList.slice(0, 5)) {
    const history = await call("im.history", { sessionId: session.sessionId, limit: 20 });
    for (const message of history?.messages || []) {
      if (message.msgType === 245 || message.merge) merges.push(message);
    }
  }
  if (merges.length > 0) {
    const merged = await call("im.mergeContent", { msgId: merges[0].msgId });
    record("im.mergeContent", merged?.ok === true, `title=${merged?.title} entries=${merged?.entries?.length}`);
  } else {
    console.log("SKIP  im.mergeContent  （最近 5 个会话没有合并消息）");
  }

  const failed = results.filter((item) => !item.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  return failed.length === 0 ? 0 : 1;
}

main()
  .then((code) => {
    socket?.end();
    child?.kill();
    restoreBridgeInfo?.();
    process.exit(code);
  })
  .catch((error) => {
    console.error("自测失败：" + error.message);
    socket?.end();
    child?.kill();
    restoreBridgeInfo?.();
    process.exit(1);
  });
