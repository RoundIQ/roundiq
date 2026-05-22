// RoundIQ — Vercel API Function
// File: api/local-courses.js
import { readFileSync } from 'fs';
import { join } from 'path';

const VILLAGES_EXECUTIVE_COURSES = new Set([
  'Amberwood','Bacall','Beautyberry','Bellaire','Belmont','Bogart','Bonita Pass',
  'Briarwood','Chula Vista','Churchill Greens','De La Vista','El Diablo','El Santiago',
  'Escambia','Gray Fox','Hawkes Bay','Heron','Hill Top','Honeysuckle','Laurel Oak',
  'Loblolly','Longleaf','Lowlands','Mangrove','Mira Mesa','Oakleigh','Okeechobee',
  'Palmetto','Pelican','Pimlico','Red Fox','Redfish Run','Roosevelt','Saddlebrook',
  'Sandhill','Sarasota','Silver Lake','Southern Star','Sweet Gum','Tarpon Boil',
  'Truman','Turtle Mound','Volusia','Walnut Grove','Yankee Clipper'
]);

const EXECUTIVE_TEE_MAP = { 'Blue': 'Black', 'White': 'Yellow', 'Red': 'Green' };

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');
  const query    = (req.query.q      || '').toLowerCase().trim();
  const courseId =  req.query.id     || '';
  const gender   = (req.query.gender || 'male').toLowerCase();
  if (!query && !courseId) {
    return res.status(400).json({ error: 'Missing query parameter' });
  }
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
    return res.status(200).json(normalizeCourse(course, gender));
  }
  const results = courses.filter(c => {
    const searchable = [c.name, c.subtitle, c.city, c.state]
      .filter(Boolean).join(' ').toLowerCase();
    return searchable.includes(query);
  }).slice(0, 8).map(c => ({
    id: c.id, name: c.name, subtitle: c.subtitle || '',
    city: c.city, state: c.state, holes: c.holes, local: true,
  }));
  return res.status(200).json({ courses: results });
}

function normalizeCourse(course, gender) {
  const isExecutive = VILLAGES_EXECUTIVE_COURSES.has(course.name);
  const tees = (course.tees || []).map(t => {
    const genderData = t[gender] || {};
    const teeName = isExecutive ? (EXECUTIVE_TEE_MAP[t.name] || t.name) : t.name;
    return {
      name:   teeName,
      gender: gender,
      rating: genderData.rating || null,
      slope:  genderData.slope  || null,
      yards:  t.yards || null,
      par:    t.par   || null,
      holes:  t.holes || null,
    };
  });
  return {
    id: course.id, name: course.name,
    city: course.city || '', state: course.state || '',
    numHoles: course.holes || 18,
    tees,
  };
}
