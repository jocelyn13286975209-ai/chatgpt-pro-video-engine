# ChatGPT Pro Video Engine

Starter deployment for a private video-rendering API. It combines a Remotion composition project, HyperFrames CLI rendering, FFmpeg, and optional ElevenLabs text-to-speech. It is **not yet deployed** until you create the hosting service and configure its secrets.

## Stack
- Node.js 22 + Express API
- Remotion 4 server/CLI packages (versions pinned together)
- HyperFrames CLI (HTML/CSS/JS to MP4)
- FFmpeg + Chromium in Docker
- Optional ElevenLabs API
- Render.com Blueprint deployment

## Deploy
1. Push this repository to GitHub (already created).
2. In Render, choose **New → Blueprint**, connect this repository, and apply `render.yaml`.
3. Set `VIDEO_API_KEY` to a long random secret in the Render service environment.
4. Register at https://elevenlabs.io/ and add `ELEVENLABS_API_KEY` as a secret. Do not commit API keys.
5. Wait for the service health check at `/health`.
6. Open `/openapi.json`, replace the server URL with the actual Render URL, and import the schema into a Custom GPT Action. Set Action authentication to Bearer API key using the same `VIDEO_API_KEY`.

## Endpoints
- `GET /health` — health and integration status
- `GET /openapi.json` — OpenAPI schema for GPT Actions
- `POST /v1/render/hyperframes` — JSON `{ "html": "...", "filename": "clip.mp4" }`
- `POST /v1/voice` — JSON `{ "text": "...", "voice_id": "...", "model_id": "eleven_multilingual_v2" }`
- `GET /v1/renders/{filename}` — download a generated file (Bearer auth)

## Remotion demo
The initial Remotion composition is in `src/remotion/index.jsx`. Render it locally with the Remotion CLI after dependencies are installed. This starter keeps the Remotion demo separate from HyperFrames rendering; each engine has its own composition model.

## Important production notes
- Rendering can be CPU/memory intensive. Choose a host plan with sufficient RAM/CPU and persistent storage.
- The sample HyperFrames route is an initial CLI integration and should be validated against the selected HyperFrames CLI version before production use.
- Do not expose the API without authentication, request limits, job queueing, and storage controls.
- Never put provider API keys in frontend code, GitHub source files, or chat messages.

## Official references
- Remotion renderer: https://www.remotion.dev/docs/render
- HyperFrames: https://github.com/heygen-com/hyperframes
- ElevenLabs API authentication: https://elevenlabs.io/docs/api-reference/authentication
- GPT Actions: https://help.openai.com/en/articles/9442513-configuring-actions-in-gpts
