// RoundIQ — Vercel API Function
// File: api/scan-scorecard.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'Anthropic API key not configured' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { image, mimeType = 'image/jpeg', side = 'front' } = body;

  if (!image) {
    return res.status(400).json({ error: 'Missing image data' });
  }

  const sideContext = side === 'back'
    ? 'This is the BACK of the scorecard showing holes 10-18.'
    : side === 'full'
    ? 'This scorecard may show all 18 holes.'
    : 'This is the FRONT of the scorecard showing holes 1-9.';

  const prompt = `You are reading a golf scorecard image. ${sideContext}

Extract the hole-by-hole data and return ONLY a valid JSON object — no explanation, no markdown, no backticks.

Rules:
- Extract par and yardage for each hole visible
- If multiple yardage rows exist (different tees), extract ALL tee yardages
- Number holes sequentially as they appear on the card
- If the card shows holes 10-18, number them 10 through 18
- If a value is illegible, use null
- Return ONLY the JSON object below

Required JSON format:
{
  "holesFound": <number of holes detected, either 9 or 18>,
  "holes": [
    { "number": 1, "par": 4, "yards": { "black": 425, "blue": 398, "white": 365, "red": 310 } },
    { "number": 2, "par": 3, "yards": { "black": 185, "blue": 172, "white": 155, "red": 128 } }
  ],
  "teeNames": ["black", "blue", "white", "red"]
}

Only include tee names that actually appear on the card. Common tee color names: black, gold, blue, white, green, red, silver, copper, combo, friendly.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: image }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || 'Claude API error',
        type: data.error?.type || 'unknown',
        detail: JSON.stringify(data)
      });
    }

    const text = data.content?.[0]?.text || '';
    let parsed;

    try {
      const clean = text.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      return res.status(422).json({
        error: 'Could not parse scorecard — try a clearer photo',
        raw: text
      });
    }

    if (!parsed.holes || !Array.isArray(parsed.holes)) {
      return res.status(422).json({ error: 'No holes detected — try a clearer photo' });
    }

    return res.status(200).json({
      holesFound: parsed.holesFound || parsed.holes.length,
      holes: parsed.holes,
      teeNames: parsed.teeNames || [],
      side,
    });

  } catch (err) {
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}
