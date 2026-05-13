// ============================================================
// RoundIQ — Netlify Serverless Function
// File: netlify/functions/golf-search.js
//
// SETUP INSTRUCTIONS:
// 1. In your Netlify dashboard → Site configuration → Environment variables
// 2. Add variable: GOLF_API_KEY = your key from golfcourseapi.com
// 3. Create folder structure in your project: netlify/functions/
// 4. Place this file at: netlify/functions/golf-search.js
// 5. Redeploy your site — Netlify auto-detects functions
//
// HOW IT WORKS:
// The app calls /.netlify/functions/golf-search?q=coursename
// This function calls the real API with your hidden key
// Returns results to the app — key never exposed to browser
// ============================================================

exports.handler = async (event) => {

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const query = event.queryStringParameters?.q || '';
  const courseId = event.queryStringParameters?.id || '';

  if (!query && !courseId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing query parameter' })
    };
  }

  const API_KEY = process.env.GOLF_API_KEY;
  if (!API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key not configured' })
    };
  }

  try {
    let url, response, data;

    if (courseId) {
      // ── Fetch full course detail (pars + yardages) ──────────
      url = `https://api.golfcourseapi.com/v1/courses/${courseId}`;
      response = await fetch(url, {
        headers: { 'Authorization': `Key ${API_KEY}` }
      });
      data = await response.json();

      if (!response.ok) {
        return {
          statusCode: response.status,
          body: JSON.stringify({ error: data.message || 'API error' })
        };
      }

      // Normalize the course detail response for RoundIQ
      const course = data.course || data;
      const normalized = normalizeCourseDetail(course);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(normalized)
      };

    } else {
      // ── Search courses by name ───────────────────────────────
      url = `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(query)}`;
      response = await fetch(url, {
        headers: { 'Authorization': `Key ${API_KEY}` }
      });
      data = await response.json();

      if (!response.ok) {
        return {
          statusCode: response.status,
          body: JSON.stringify({ error: data.message || 'API error' })
        };
      }

      // Return top 8 results normalized
      const courses = (data.courses || []).slice(0, 8).map(c => ({
        id:       c.id,
        name:     c.club_name || c.name,
        city:     c.location?.city || c.city || '',
        state:    c.location?.state || c.state || '',
        holes:    c.num_holes || c.holes || 18,
      }));

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ courses })
      };
    }

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error', detail: err.message })
    };
  }
};

// ── Normalize course detail into RoundIQ format ──────────────
function normalizeCourseDetail(course) {
  const tees = course.tees || [];

  // Build tee options — prefer Men's/Women's labels
  const teeOptions = tees.map(t => ({
    name:   t.tee_name || t.name || 'Unknown',
    gender: t.gender || 'male',
    rating: parseFloat(t.course_rating || t.rating) || null,
    slope:  parseInt(t.slope_rating || t.slope) || null,
    yards:  parseInt(t.total_yards || t.yardage) || null,
    holes:  buildHoleData(t.holes || []),
  }));

  return {
    id:         course.id,
    name:       course.club_name || course.name,
    city:       course.location?.city || course.city || '',
    state:      course.location?.state || course.state || '',
    numHoles:   course.num_holes || 18,
    tees:       teeOptions,
  };
}

function buildHoleData(holes) {
  if (!holes.length) return null;
  return holes.map(h => ({
    number: h.hole_number || h.number,
    par:    parseInt(h.par) || 4,
    yards:  parseInt(h.yardage || h.yards) || null,
  }));
}
