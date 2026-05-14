// RoundIQ — Vercel API Function
// File: api/local-courses.js
//
// Serves the local courses database — checked before the golf API
// GET ?q=search term  → returns matching courses
// GET ?id=local-xxx   → returns full course detail

import courses from '../courses.json' assert { type: 'json' };

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  const query    = (req.query.q  || '').toLowerCase().trim();
  const courseId = req.query.id  || '';

  if (!query && !courseId) {
    return res.status(400).json({ error: 'Missing query parameter' });
  }

  if (courseId) {
    // Return full course detail by ID
    const course = courses.find(c => c.id === courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }
    return res.status(200).json(course);
  }

  // Search by name — fuzzy match on name, subtitle, city
  const results = courses.filter(c => {
    const searchable = [c.name, c.subtitle, c.city, c.state]
      .filter(Boolean).join(' ').toLowerCase();
    // Split query into words — all must match
    return query.split(' ').every(word => searchable.includes(word));
  }).slice(0, 8).map(c => ({
    id:       c.id,
    name:     c.name,
    subtitle: c.subtitle || '',
    city:     c.city,
    state:    c.state,
    holes:    c.holes,
    local:    true,
  }));

  return res.status(200).json({ courses: results });
}
