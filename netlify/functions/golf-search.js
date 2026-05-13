// RoundIQ — Netlify Function — netlify/functions/golf-search.js

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
      url = `https://api.golfcourseapi.com/v1/courses/${courseId}`;
      response = await fetch(url, { headers: { 'Authorization': `Key ${API_KEY}` } });
      data = await response.json();

      if (!response.ok) {
        return { statusCode: response.status, body: JSON.stringify({ error: data.message || 'API error' }) };
      }

      // ✅ API wraps everything in a "course" key
      const course = data.course || data;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(normalizeCourseDetail(course))
      };

    } else {
      url = `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(query)}`;
      response = await fetch(url, { headers: { 'Authorization': `Key ${API_KEY}` } });
      data = await response.json();

      if (!response.ok) {
        return { statusCode: response.status, body: JSON.stringify({ error: data.message || 'API error' }) };
      }

      const courses = (data.courses || []).slice(0, 8).map(c => {
        // Build a display name that disambiguates courses with the same club name
        // e.g. "The Villages Palmer Legends" has multiple 18-hole combos
        // course_name contains the specific combo e.g. "Laurel Valley/Riley Grove"
        const courseName = c.course_name || '';
        const clubName   = c.club_name   || c.name || '';
        // Only show subtitle if it adds info beyond the club name
        const subtitle = courseName && courseName !== clubName ? courseName : '';

        return {
          id:       c.id,
          name:     clubName,
          subtitle: subtitle,
          city:     c.location?.city  || c.city  || '',
          state:    c.location?.state || c.state || '',
          holes:    c.num_holes || c.holes || 18,
        };
      });

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

// API structure: data.course.tees.female = [...] and data.course.tees.male = [...]
// Each tee: { tee_name, course_rating, slope_rating, total_yards, par_total, holes: [{par, yardage}] }

function normalizeCourseDetail(course) {
  const teesObj = course.tees || {};
  const allTees = [];

  const maleTees   = Array.isArray(teesObj.male)   ? teesObj.male   : teesObj.male   ? Object.values(teesObj.male)   : [];
  const femaleTees = Array.isArray(teesObj.female) ? teesObj.female : teesObj.female ? Object.values(teesObj.female) : [];

  maleTees.forEach(t   => allTees.push({ ...t, _gender: 'male'   }));
  femaleTees.forEach(t => allTees.push({ ...t, _gender: 'female' }));

  // Fallback if tees is a flat array
  if (!allTees.length && Array.isArray(teesObj)) {
    teesObj.forEach(t => allTees.push({ ...t, _gender: t.gender || 'male' }));
  }

  const tees = allTees.map(t => ({
    name:   t.tee_name   || t.name || 'Unknown',
    gender: t._gender,
    rating: parseFloat(t.course_rating || t.front_course_rating) || null,
    slope:  parseInt(t.slope_rating    || t.front_slope_rating)  || null,
    yards:  parseInt(t.total_yards     || t.yardage)             || null,
    par:    parseInt(t.par_total)                                 || null,
    holes:  buildHoleData(t.holes || []),
  }));

  return {
    id:       course.id,
    name:     course.club_name  || course.course_name || course.name || '',
    city:     course.location?.city  || course.city  || '',
    state:    course.location?.state || course.state || '',
    numHoles: course.num_holes  || 18,
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
