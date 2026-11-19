# AI Video Studio (Local-first)

A local-first video production workspace. No Render account or cloud server is required. Your uploads and exports stay on your Windows computer in `video-data/`.

## Features in this starter
- Local Express server and browser UI at http://127.0.0.1:8787
- Upload images, videos, voiceovers, and music
- Background auto-edit job queue (in-memory queue; keep the app running)
- FFmpeg normalization, image-to-video clips, concatenation, optional audio track, MP4 export
- Remotion title-card render endpoint
- Original HyperFrames HTML-to-video endpoint retained
- Optional bearer authentication: set `VIDEO_API_KEY` in your environment if you intentionally expose/use the API beyond localhost

## Windows one-click start
1. Install Node.js 22 or newer: https://nodejs.org/
2. Install Git for Windows if you plan to clone the repository: https://git-scm.com/downloads/win
3. Install FFmpeg. The launcher attempts a Winget install if FFmpeg is missing; if that fails, install it manually and ensure `ffmpeg` and `ffprobe` are on PATH.
4. Download/clone this repository.
5. Double-click `start-windows.bat` (or run `start-windows.ps1` in PowerShell).
6. Open http://127.0.0.1:8787

The first start runs `npm install`. Keep the terminal window open while rendering. Stop the server with Ctrl+C.

## API
- `GET /health`
- `POST /api/uploads` multipart form-data field `files` (repeat for multiple files)
- `POST /api/jobs/auto-edit` JSON: `{ "assetIds": ["..."], "voiceoverId": "...", "musicId": "...", "title": "...", "secondsPerImage": 4 }`
- `GET /api/jobs` and `GET /api/jobs/{id}`
- `GET /api/jobs/{id}/output`
- `POST /api/render/remotion` JSON: `{ "title": "...", "subtitle": "..." }`
- `POST /v1/render/hyperframes` JSON: `{ "html": "...", "filename": "clip.mp4" }`

## Important limitations (honest status)
- This is a local editing/rendering foundation, not a generative text-to-video model. AI scene generation, semantic clip selection, speech-to-text subtitles, transitions, and a full timeline editor are future modules.
- Current auto-edit creates a simple sequence in upload order; images become still-image clips. If a voiceover or music file is selected, it is used as the output audio track (voiceover takes precedence).
- Jobs are held in memory; restarting the app loses job history. Uploaded files and completed MP4s remain in `video-data/`.
- Rendering speed depends on your computer. Large files need disk space and time.
- The server binds to 127.0.0.1 only. Do not expose it directly to the public internet. Do not commit personal media or secrets to GitHub.
- HyperFrames CLI integration remains experimental and should be validated on the local machine.

## Existing cloud deployment
The previous `render.yaml` and Dockerfile are retained for possible future use, but local-first setup does not use them.
