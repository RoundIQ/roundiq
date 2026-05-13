// RoundIQ — Netlify Function — netlify/functions/golf-search.js

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const query    = event.queryStringParameters?.q     || '';
  const courseId = event.queryStringParameters?.id    || '';
  const debug    = event.queryStringParameters?.debug || '';

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
      url = `https://api.golfcourseapi.com/v1/courses/${courseId}`;
      response = await fetch(url, { headers: { 'Authorization': `Key ${API_KEY}` } });
      data = await response.json();

      if (!response.ok) {
        return { statusCode: response.status, body: JSON.stringify({ error: data.message || 'API error' }) };
      }

      // Debug mode — return raw response so we can see field names
      if (debug === '1') {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({
            _debug: true,
            topLevelKeys: Object.keys(data),
            teesType: typeof data.tees,
            teesIsArray: Array.isArray(data.tees),
            teesKeys: data.tees ? Object.keys(data.tees) : null,
            firstTeeSample: data.tees ? (Array.isArray(data.tees) ? data.tees[0] : Object.values(data.tees)[0]) : null,
            raw: data
          })
        };
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(normalizeCourseDetail(data))
      };

    } else {
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

function normalizeCourseDetail(data) {
  const teesObj = data.tees || {};
  const allTees = [];

  const maleTees   = Array.isArray(teesObj.male)   ? teesObj.male   : teesObj.male   ? Object.values(teesObj.male)   : [];
  const femaleTees = Array.isArray(teesObj.female) ? teesObj.female : teesObj.female ? Object.values(teesObj.female) : [];

  maleTees.forEach(t   => allTees.push({ ...t, _gender: 'male'   }));
  femaleTees.forEach(t => allTees.push({ ...t, _gender: 'female' }));

  if (!allTees.length && Array.isArray(teesObj)) {
    teesObj.forEach(t => allTees.push({ ...t, _gender: t.gender || 'male' }));
  }

  const tees = allTees.map(t => ({
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
    tees,
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
