Avatar Viewer
=============

Run local server and open the viewer.

```bash
npm i
npm start
```

- Drop your GLB into the project root or host it elsewhere.
- In the UI, set the Model URL to the GLB path (defaults to the existing `Human woman Diana Alatalo.glb`).
- Buttons: Idle (simple jaw motion), Blink (one-off blink).
- The code includes a stub `applyViseme(id, strength)` you can connect to your TTS viseme events.

Next
----
- Replace the placeholder model with your generated avatar GLB (ARKit-52 blendshapes recommended).
- Provide `facemap.json` to map your GLB morph names to viseme IDs.

