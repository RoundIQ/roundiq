// RoundIQ — Vercel API Function
// File: api/local-courses.js

import { readFileSync } from 'fs';
import { join } from 'path';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  const query    = (req.query.q  || '').toLowerCase().trim();
  const courseId = req.query.id  || '';

  if (!query && !courseId) {
    return res.status(400).json({ error: 'Missing query parameter' });
  }

  // Load courses from JSON file
  let courses;
  try {
    const filePath = join(process.cwd(), 'courses.json');
    courses = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch(e) {
    return res.status(500).json({ error: 'Could not load course database', detail: e.message });
  }

  if (courseId) {
    const course = courses.find(c => c.id === courseId);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    return res.status(200).json(course);
  }

  // Search by name — all query words must appear in searchable fields
  const results = courses.filter(c => {
    const searchable = [c.name, c.subtitle, c.city, c.state]
      .filter(Boolean).join(' ').toLowerCase();
    return query.split(' ').filter(Boolean).every(word => searchable.includes(word));
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
