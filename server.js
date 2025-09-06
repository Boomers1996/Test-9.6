import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Serve static
app.use(express.static(__dirname));

// Minimal proxy for emotion mapping using OpenAI
app.post('/api/emotion', async (req, res) => {
  try {
    const description = String(req.body?.description || '');
    if (!description) return res.status(400).json({ error: 'description required' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // If no server key, return 204 to let client fallback
      return res.status(204).end();
    }

    const system = 'You map natural language to {emotion, intensity in [0,1]} among: neutral, happy, sad, angry, surprised. Keep JSON only.';
    const user = `Description: ${description}`;
    const payload = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    };

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(502).json({ error: 'openai_failed', details: text });
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    try {
      const json = JSON.parse(content);
      return res.json(json);
    } catch {
      return res.status(502).json({ error: 'invalid_json', content });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server_error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server on http://localhost:${port}`);
});

