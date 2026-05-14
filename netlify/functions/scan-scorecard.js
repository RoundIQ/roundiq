// RoundIQ — Netlify Function — netlify/functions/scan-scorecard.js
//
// Accepts a base64 image of a golf scorecard and uses Claude's vision
// to extract hole pars and yardages. Handles both front 9 and back 9.
//
// POST body: { image: base64string, mimeType: "image/jpeg", side: "front"|"back"|"full" }
// Returns:   { holes: [{number, par, yards}], holesFound: 9|18, side: "front"|"back"|"full" }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Anthropic API key not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { image, mimeType = 'image/jpeg', side = 'front' } = body;

  if (!image) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing image data' }) };
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
              source: {
                type: 'base64',
                media_type: mimeType,
                data: image,
              }
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
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: data.error?.message || 'Claude API error',
          type: data.error?.type || 'unknown',
          detail: JSON.stringify(data)
        })
      };
    }

    // Parse Claude's response
    const text = data.content?.[0]?.text || '';
    let parsed;

    try {
      // Strip any accidental markdown fences
      const clean = text.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      return {
        statusCode: 422,
        body: JSON.stringify({
          error: 'Could not parse scorecard — try a clearer photo',
          raw: text
        })
      };
    }

    // Validate structure
    if (!parsed.holes || !Array.isArray(parsed.holes)) {
      return {
        statusCode: 422,
        body: JSON.stringify({ error: 'No holes detected — try a clearer photo' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        holesFound: parsed.holesFound || parsed.holes.length,
        holes: parsed.holes,
        teeNames: parsed.teeNames || [],
        side,
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error', detail: err.message })
    };
  }
};
