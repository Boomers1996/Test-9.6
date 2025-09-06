# Avatar Emotion Player

A minimal, no-build web app to load a .GLB avatar, browse animations, control morph targets, and drive expressions from natural language (via a local heuristic or optional OpenAI API).

## Quick start

1. Install deps and start server:

```bash
npm install
npm start
```

2. Open `http://localhost:3000`.
3. Drag & drop your `.glb` file into the viewer or use the file picker.

## LLM integration (optional)

- Server-side: set `OPENAI_API_KEY` in your environment before `npm start` to enable the `/api/emotion` endpoint.

```bash
OPENAI_API_KEY=sk-... npm start
```

- Client-side: if the server does not have a key, you can paste a key into the UI field; the browser will call OpenAI directly. Clear it when done.

## Features

- Loads `.glb/.gltf` via `GLTFLoader`
- Lists available animation clips and supports basic play/stop
- Detects morph targets and creates sliders
- Emotion presets: Neutral, Happy, Sad, Angry, Surprised
- Smooth morph tweening for natural expression transitions
- Text-to-emotion via LLM with fallback to local keyword heuristic

## Notes on morph names

Avatars differ in morph naming (ARKit, VRM, Character Creator, custom). The app tries common aliases (e.g., `ARKit.JawOpen`, `mouthSmileLeft/Right`). If a preset doesn’t affect your avatar, open the sliders and note your morph names; you can extend alias lists in `main.js`.

## File locations

- `index.html`, `styles.css`, `main.js`: client app
- `server.js`: static server and optional `/api/emotion` proxy

## Troubleshooting

- Blank screen: open devtools console for errors. Ensure the GLB is valid.
- No morphs found: your model might not have blendshapes. Use animation clips or provide another avatar.
- CORS/Network errors calling OpenAI: prefer the server proxy by setting `OPENAI_API_KEY`.

