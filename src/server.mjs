import express from "express";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

const app = express();
app.use(express.json({ limit: "2mb" }));
const PORT = Number(process.env.PORT || 8080);
const OUTPUT_DIR = process.env.RENDER_OUTPUT_DIR || path.resolve("renders");
const API_KEY = process.env.VIDEO_API_KEY;

function auth(req, res, next) {
  if (!API_KEY) return res.status(503).json({ error: "VIDEO_API_KEY is not configured" });
  const supplied = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(supplied), b = Buffer.from(API_KEY);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Unauthorized" });
  next();
}
function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", d => stdout += d);
    child.stderr.on("data", d => stderr += d);
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr || stdout || command + " exited " + code)));
  });
}
app.get("/health", (_req, res) => res.json({ ok: true, service: "chatgpt-pro-video-engine", engines: ["remotion", "hyperframes"], voice: process.env.ELEVENLABS_API_KEY ? "configured" : "not_configured" }));
app.get("/openapi.json", (_req, res) => res.json(openapi));

app.post("/v1/render/hyperframes", auth, async (req, res) => {
  const { html, filename = "video.mp4" } = req.body || {};
  if (typeof html !== "string" || html.length < 20 || html.length > 1_000_000) return res.status(400).json({ error: "html must be a string between 20 bytes and 1MB" });
  const id = crypto.randomUUID();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hyperframes-"));
  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.mp4$/i, "") + ".mp4";
  try {
    await fs.writeFile(path.join(dir, "index.html"), html);
    await run("npx", ["--yes", "hyperframes", "render", "--output", "video.mp4"], dir);
    const source = path.join(dir, "video.mp4");
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const dest = path.join(OUTPUT_DIR, id + "-" + safeName);
    await fs.copyFile(source, dest);
    res.json({ id, status: "completed", filename: path.basename(dest), download_url: "/v1/renders/" + encodeURIComponent(path.basename(dest)) });
  } catch (e) { res.status(500).json({ error: "HyperFrames render failed", detail: String(e.message).slice(0, 2000) }); }
  finally { await fs.rm(dir, { recursive: true, force: true }); }
});

app.get("/v1/renders/:name", auth, async (req, res) => {
  const name = path.basename(req.params.name);
  const file = path.join(OUTPUT_DIR, name);
  try { await fs.access(file); res.download(file); }
  catch { res.status(404).json({ error: "Render not found" }); }
});

app.post("/v1/voice", auth, async (req, res) => {
  const { text, voice_id, model_id = "eleven_multilingual_v2" } = req.body || {};
  if (!process.env.ELEVENLABS_API_KEY) return res.status(503).json({ error: "ElevenLabs is not configured. Set ELEVENLABS_API_KEY in your host's secret environment variables." });
  if (typeof text !== "string" || !text.trim() || text.length > 5000 || typeof voice_id !== "string") return res.status(400).json({ error: "text (max 5000 chars) and voice_id are required" });
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + encodeURIComponent(voice_id), {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id })
    });
    if (!r.ok) return res.status(r.status).json({ error: "ElevenLabs request failed", detail: (await r.text()).slice(0, 1000) });
    const id = crypto.randomUUID();
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const name = id + ".mp3";
    await fs.writeFile(path.join(OUTPUT_DIR, name), Buffer.from(await r.arrayBuffer()));
    res.json({ id, status: "completed", filename: name, download_url: "/v1/renders/" + name });
  } catch (e) { res.status(502).json({ error: String(e.message) }); }
});

const openapi = {
  openapi: "3.1.0",
  info: { title: "ChatGPT Pro Video Engine", version: "0.1.0", description: "Render HyperFrames HTML video and generate ElevenLabs voiceovers." },
  servers: [{ url: "https://REPLACE-WITH-YOUR-SERVICE.onrender.com" }],
  components: { securitySchemes: { BearerAuth: { type: "http", scheme: "bearer" } } },
  security: [{ BearerAuth: [] }],
  paths: {
    "/v1/render/hyperframes": { post: { operationId: "renderHyperFrames", summary: "Render HTML/CSS/JS as an MP4 video", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["html"], properties: { html: { type: "string" }, filename: { type: "string" } } } } } }, responses: { "200": { description: "Render result" } } } },
    "/v1/voice": { post: { operationId: "generateVoiceover", summary: "Generate a voiceover with ElevenLabs", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["text", "voice_id"], properties: { text: { type: "string" }, voice_id: { type: "string" }, model_id: { type: "string", default: "eleven_multilingual_v2" } } } } } }, responses: { "200": { description: "Audio result" } } } }
  }
};

app.listen(PORT, () => console.log("Video engine listening on " + PORT));
