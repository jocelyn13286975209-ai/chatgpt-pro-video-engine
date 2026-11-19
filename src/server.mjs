import express from "express";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import multer from "multer";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia, selectComposition } from "@remotion/renderer";

const app = express();
app.use(express.json({ limit: "10mb" }));
const PORT = Number(process.env.PORT || 8787);
const ROOT = process.cwd();
const DATA = path.resolve(process.env.VIDEO_DATA_DIR || "video-data");
const UPLOADS = path.join(DATA, "uploads");
const OUTPUTS = path.join(DATA, "renders");
const MAX_FILE = Number(process.env.MAX_UPLOAD_BYTES || 1024 * 1024 * 1024);
await Promise.all([UPLOADS, OUTPUTS].map(p => fs.mkdir(p, { recursive: true })));
const jobs = new Map();
const uploadMeta = new Map();
const upload = multer({ dest: UPLOADS, limits: { fileSize: MAX_FILE, files: 30 } });

function auth(req, res, next) {
  const key = process.env.VIDEO_API_KEY;
  if (!key) return next(); // Local-first: authentication is optional on localhost.
  const supplied = (req.headers.authorization || "").replace(/^Bearer\\s+/i, "");
  const a = Buffer.from(supplied), b = Buffer.from(key);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Unauthorized" });
  next();
}
function run(command, args, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", d => stdout += d.toString());
    child.stderr.on("data", d => stderr += d.toString());
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error((stderr || stdout || command + " exited " + code).slice(-5000))));
  });
}
function publicJob(job) {
  return { id: job.id, status: job.status, progress: job.progress, message: job.message, createdAt: job.createdAt, output: job.output || null, error: job.error || null };
}
app.use(express.static(path.join(ROOT, "public")));
app.get("/health", (_req, res) => res.json({ ok: true, service: "local-video-studio", engines: ["remotion", "hyperframes", "ffmpeg"], localFirst: true }));
app.get("/api/jobs", auth, (_req, res) => res.json([...jobs.values()].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(publicJob)));
app.get("/api/jobs/:id", auth, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(publicJob(job));
});
app.get("/api/jobs/:id/output", auth, async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job?.output) return res.status(404).json({ error: "Output not ready" });
  res.download(job.output.path, job.output.filename);
});
app.post("/api/uploads", auth, upload.array("files", 30), (req, res) => {
  const files = (req.files || []).map(f => {
    const item = { id: path.basename(f.filename), originalName: f.originalname, mimeType: f.mimetype, size: f.size, kind: f.mimetype.startsWith("audio/") ? "audio" : f.mimetype.startsWith("image/") ? "image" : "video" };
    uploadMeta.set(item.id, item);
    return item;
  });
  res.status(201).json({ files });
});
app.post("/api/jobs/auto-edit", auth, async (req, res) => {
  const { assetIds, voiceoverId, musicId, title = "My video", width = 1920, height = 1080, secondsPerImage = 4 } = req.body || {};
  if (!Array.isArray(assetIds) || assetIds.length === 0 || assetIds.length > 30) return res.status(400).json({ error: "assetIds must contain 1-30 uploaded asset IDs" });
  const safeId = id => typeof id === "string" && /^[a-f0-9]{20,40}$/.test(id);
  const assets = [];
  for (const id of assetIds) {
    if (!safeId(id)) return res.status(400).json({ error: "Invalid asset ID" });
    const p = path.join(UPLOADS, id);
    try { await fs.access(p); } catch { return res.status(404).json({ error: "Uploaded asset not found: " + id }); }
    assets.push({ id, path: p });
  }
  for (const id of [voiceoverId, musicId].filter(Boolean)) {
    if (!safeId(id)) return res.status(400).json({ error: "Invalid audio asset ID" });
    try { await fs.access(path.join(UPLOADS, id)); } catch { return res.status(404).json({ error: "Audio asset not found" }); }
  }
  const id = crypto.randomUUID();
  const job = { id, status: "queued", progress: 0, message: "Waiting to render", createdAt: new Date().toISOString() };
  jobs.set(id, job);
  res.status(202).json(publicJob(job));
  runAutoEdit(job, assets, { voiceoverId, musicId, title, width: Number(width), height: Number(height), secondsPerImage: Math.max(1, Math.min(20, Number(secondsPerImage) || 4)) }).catch(e => {
    job.status = "failed"; job.error = String(e.message); job.message = "Render failed";
  });
});
async function runAutoEdit(job, assets, opts) {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "video-studio-"));
  const normalized = [];
  try {
    job.status = "processing";
    for (let i = 0; i < assets.length; i++) {
      const input = assets[i].path;
      const originalName = uploadMeta.get(assets[i].id)?.originalName || "";
      const ext = path.extname(originalName).toLowerCase();
      const isImage = [" .jpg",".jpeg",".png",".webp",".bmp",".gif",".tif",".tiff"].map(x => x.trim()).includes(ext);
      const out = path.join(work, String(i).padStart(3, "0") + ".mp4");
      const vf = "scale=" + opts.width + ":" + opts.height + ":force_original_aspect_ratio=decrease,pad=" + opts.width + ":" + opts.height + ":(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p";
      const args = isImage
        ? ["-y","-loop","1","-i",input,"-t",String(opts.secondsPerImage),"-vf",vf,"-an","-c:v","libx264","-preset","veryfast","-pix_fmt","yuv420p",out]
        : ["-y","-i",input,"-vf",vf,"-an","-c:v","libx264","-preset","veryfast","-pix_fmt","yuv420p","-movflags","+faststart",out];
      job.progress = Math.round((i / assets.length) * 70);
      job.message = "Preparing clip " + (i + 1) + " of " + assets.length;
      await run("ffmpeg", args);
      normalized.push(out);
    }
    const list = path.join(work, "concat.txt");
    await fs.writeFile(list, normalized.map(p => "file '" + p.replace(/'/g, "'\\''") + "'").join("\\n"));
    const joined = path.join(work, "joined.mp4");
    await run("ffmpeg", ["-y","-f","concat","-safe","0","-i",list,"-c","copy",joined]);
    const output = path.join(OUTPUTS, job.id + ".mp4");
    const audio = opts.voiceoverId || opts.musicId;
    if (audio) {
      const audioPath = path.join(UPLOADS, opts.voiceoverId || opts.musicId);
      const args = ["-y","-i",joined,"-i",audioPath,"-map","0:v:0","-map","1:a:0","-c:v","copy","-c:a","aac","-shortest","-movflags","+faststart",output];
      await run("ffmpeg", args);
    } else {
      await fs.copyFile(joined, output);
    }
    job.output = { path: output, filename: (String(opts.title).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0,60) || "video") + ".mp4" };
    job.status = "completed"; job.progress = 100; job.message = "Video ready";
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}
let remotionBundle;
app.post("/api/render/remotion", auth, async (req, res) => {
  try {
    const { title = "Your next video", subtitle = "Created with Remotion" } = req.body || {};
    remotionBundle ||= await bundle({ entryPoint: path.join(ROOT, "src/remotion/index.jsx") });
    const comps = await getCompositions(remotionBundle);
    const composition = await selectComposition({ serveUrl: remotionBundle, id: "Main", inputProps: { title, subtitle } });
    const id = crypto.randomUUID(), output = path.join(OUTPUTS, id + ".mp4");
    await renderMedia({ composition, serveUrl: remotionBundle, codec: "h264", outputLocation: output, inputProps: { title, subtitle } });
    res.json({ id, status: "completed", filename: path.basename(output), download_url: "/api/remotion/" + id });
  } catch (e) { res.status(500).json({ error: "Remotion render failed", detail: String(e.message).slice(0, 3000) }); }
});
app.get("/api/remotion/:id", auth, (req, res) => {
  const p = path.join(OUTPUTS, path.basename(req.params.id) + ".mp4");
  res.download(p, err => { if (err && !res.headersSent) res.status(404).json({ error: "Render not found" }); });
});

// Retain the original HyperFrames endpoint for existing clients.
app.post("/v1/render/hyperframes", auth, async (req, res) => {
  const { html, filename = "video.mp4" } = req.body || {};
  if (typeof html !== "string" || html.length < 20 || html.length > 1_000_000) return res.status(400).json({ error: "html must be a string between 20 bytes and 1MB" });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hyperframes-"));
  try {
    await fs.writeFile(path.join(dir, "index.html"), html);
    await run("npx", ["--yes", "hyperframes", "render", "--output", "video.mp4"], dir);
    const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.mp4$/i, "") + ".mp4";
    const dest = path.join(OUTPUTS, crypto.randomUUID() + "-" + safeName);
    await fs.copyFile(path.join(dir, "video.mp4"), dest);
    res.json({ status: "completed", filename: path.basename(dest), download_url: "/local-renders/" + encodeURIComponent(path.basename(dest)) });
  } catch (e) { res.status(500).json({ error: "HyperFrames render failed", detail: String(e.message).slice(0, 2000) }); }
  finally { await fs.rm(dir, { recursive: true, force: true }); }
});
app.get("/local-renders/:name", auth, (req, res) => res.download(path.join(OUTPUTS, path.basename(req.params.name))));
app.listen(PORT, "127.0.0.1", () => console.log("Local Video Studio: http://127.0.0.1:" + PORT));
