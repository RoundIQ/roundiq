// ============================================================
// RoundIQ — Netlify Serverless Function
// File: netlify/functions/golf-search.js
// ============================================================

exports.handler = async (event) => {

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const query    = event.queryStringParameters?.q  || '';
  const courseId = event.queryStringParameters?.id || '';

  if (!query && !courseId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing query parameter' }) };
  }

  const API_KEY = process.env.GOLF_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  try {
    let url, response, data;

    if (courseId) {
      // ── Fetch full course detail ────────────────────────────
      url = `https://api.golfcourseapi.com/v1/courses/${courseId}`;
      response = await fetch(url, { headers: { 'Authorization': `Key ${API_KEY}` } });
      data = await response.json();

      if (!response.ok) {
        return { statusCode: response.status, body: JSON.stringify({ error: data.message || 'API error' }) };
      }

      const normalized = normalizeCourseDetail(data);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(normalized)
      };

    } else {
      // ── Search courses by name ──────────────────────────────
      url = `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(query)}`;
      response = await fetch(url, { headers: { 'Authorization': `Key ${API_KEY}` } });
      data = await response.json();

      if (!response.ok) {
        return { statusCode: response.status, body: JSON.stringify({ error: data.message || 'API error' }) };
      }

      const courses = (data.courses || []).slice(0, 8).map(c => ({
        id:    c.id,
        name:  c.club_name || c.name,
        city:  c.location?.city  || c.city  || '',
        state: c.location?.state || c.state || '',
        holes: c.num_holes || c.holes || 18,
      }));

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ courses })
      };
    }

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error', detail: err.message }) };
  }
};

// ── Normalize API response into RoundIQ format ───────────────
// API tees structure: { female: [ {...tee} ], male: [ {...tee} ] }
// Each tee: { tee_name, course_rating, slope_rating, total_yards,
//             number_of_holes, par_total, holes: [{par, yardage, handicap}] }

function normalizeCourseDetail(data) {
  const teesObj = data.tees || {};

  // Flatten male and female tees into single array with gender tag
  const allTees = [];

  const maleTees = Array.isArray(teesObj.male) ? teesObj.male :
                   teesObj.male ? Object.values(teesObj.male) : [];
  maleTees.forEach(t => allTees.push({ ...t, _gender: 'male' }));

  const femaleTees = Array.isArray(teesObj.female) ? teesObj.female :
                     teesObj.female ? Object.values(teesObj.female) : [];
  femaleTees.forEach(t => allTees.push({ ...t, _gender: 'female' }));

  // Fallback: if tees was a flat array
  if (!allTees.length && Array.isArray(teesObj)) {
    teesObj.forEach(t => allTees.push({ ...t, _gender: t.gender || 'male' }));
  }

  const teeOptions = allTees.map(t => ({
    name:   t.tee_name || t.name || 'Unknown',
    gender: t._gender,
    rating: parseFloat(t.course_rating || t.front_course_rating) || null,
    slope:  parseInt(t.slope_rating    || t.front_slope_rating)  || null,
    yards:  parseInt(t.total_yards     || t.yardage)             || null,
    par:    parseInt(t.par_total)                                 || null,
    holes:  buildHoleData(t.holes || []),
  }));

  return {
    id:       data.id,
    name:     data.club_name || data.course_name || data.name || '',
    city:     data.location?.city  || data.city  || '',
    state:    data.location?.state || data.state || '',
    numHoles: data.num_holes || 18,
    tees:     teeOptions,
  };
}

function buildHoleData(holes) {
  if (!holes || !holes.length) return null;
  return holes.map((h, i) => ({
    number: h.hole_number || h.number || (i + 1),
    par:    parseInt(h.par)                              || 4,
    yards:  parseInt(h.yardage || h.yards || h.distance) || null,
  }));
}

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
  // GolfCourseAPI returns tees in different formats — handle all of them
  let teesRaw = course.tees || course.tee_sets || course.teesets || [];

  // Sometimes tees is an object keyed by tee name, convert to array
  if (teesRaw && !Array.isArray(teesRaw)) {
    teesRaw = Object.values(teesRaw);
  }

  // Sometimes tees is nested under the course differently
  if (!teesRaw.length && course.course) {
    teesRaw = course.course.tees || course.course.tee_sets || [];
    if (!Array.isArray(teesRaw)) teesRaw = Object.values(teesRaw);
  }

  const teeOptions = teesRaw.map(t => {
    // Holes can be array or object
    let holesRaw = t.holes || t.hole_data || [];
    if (!Array.isArray(holesRaw)) holesRaw = Object.values(holesRaw);

    return {
      name:   t.tee_name || t.name || t.color || 'Unknown',
      gender: (t.gender || t.tee_gender || 'male').toLowerCase(),
      rating: parseFloat(t.course_rating || t.rating || t.courseRating) || null,
      slope:  parseInt(t.slope_rating || t.slope || t.slopeRating) || null,
      yards:  parseInt(t.total_yards || t.yardage || t.totalYards || t.yards) || null,
      holes:  buildHoleData(holesRaw),
    };
  });

  return {
    id:       course.id,
    name:     course.club_name || course.name || course.course_name || '',
    city:     course.location?.city || course.city || '',
    state:    course.location?.state || course.state || '',
    numHoles: course.num_holes || course.holes || 18,
    tees:     teeOptions,
    _raw:     course, // include raw for debugging — remove later
  };
}

function buildHoleData(holes) {
  if (!holes || !holes.length) return null;
  return holes.map(h => ({
    number: h.hole_number || h.number || h.hole,
    par:    parseInt(h.par) || 4,
    yards:  parseInt(h.yardage || h.yards || h.distance) || null,
  }));
}
