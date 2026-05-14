// RoundIQ — Vercel API Function
// File: api/golf-search.js

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const query    = req.query.q  || '';
  const courseId = req.query.id || '';

  if (!query && !courseId) {
    return res.status(400).json({ error: 'Missing query parameter' });
  }

  const API_KEY = process.env.GOLF_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    let url, response, data;

    if (courseId) {
      url = `https://api.golfcourseapi.com/v1/courses/${courseId}`;
      response = await fetch(url, { headers: { 'Authorization': `Key ${API_KEY}` } });
      data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({ error: data.message || 'API error' });
      }

      const course = data.course || data;
      return res.status(200).json(normalizeCourseDetail(course));

    } else {
      url = `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(query)}`;
      response = await fetch(url, { headers: { 'Authorization': `Key ${API_KEY}` } });
      data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({ error: data.message || 'API error' });
      }

      const courses = (data.courses || []).slice(0, 8).map(c => {
        const courseName = c.course_name || '';
        const clubName   = c.club_name   || c.name || '';
        const subtitle   = courseName && courseName !== clubName ? courseName : '';
        return {
          id:       c.id,
          name:     clubName,
          subtitle: subtitle,
          city:     c.location?.city  || c.city  || '',
          state:    c.location?.state || c.state || '',
          holes:    c.num_holes || c.holes || 18,
        };
      });

      return res.status(200).json({ courses });
    }

  } catch (err) {
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}

function normalizeCourseDetail(course) {
  const teesObj = course.tees || {};
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
