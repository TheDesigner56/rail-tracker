// ── Rolling-stock layouts ──────────────────────────────────────────────────
// The live feed gives the formation (unit numbers) and coach count but NOT
// per-coach facilities. So we overlay a *representative* layout per train
// class: where first class, the accessible coach, cycle and luggage space and
// catering typically sit. Always labelled as typical — real fit-out can vary.

const CLASSES = {
  800: 'Hitachi IET', 801: 'Hitachi IET', 802: 'Hitachi IET', 803: 'Hitachi', 805: 'Hitachi bi-mode', 807: 'Hitachi EMU',
  390: 'Pendolino', 220: 'Voyager', 221: 'Super Voyager', 222: 'Meridian', 43: 'InterCity 125 (HST)',
  175: 'Coradia', 180: 'Adelante', 185: 'TransPennine Desiro', 397: 'Nova 2', 68: 'Class 68 + Mk5', 91: 'Class 91 + Mk4',
  345: 'Elizabeth line', 700: 'Thameslink', 707: 'Class 707', 710: 'Aventra', 717: 'Class 717', 720: 'Aventra', 701: 'Arterio', 378: 'Capitalstar', 377: 'Electrostar', 387: 'Electrostar', 379: 'Electrostar', 357: 'Electrostar', 375: 'Electrostar', 376: 'Electrostar', 360: 'Desiro', 350: 'Desiro', 444: 'Desiro', 450: 'Desiro', 444: 'Desiro',
  158: 'Express Sprinter', 159: 'SW Turbo', 156: 'Super Sprinter', 150: 'Sprinter', 153: 'Sprinter', 165: 'Networker Turbo', 166: 'Networker Turbo', 168: 'Clubman', 170: 'Turbostar', 171: 'Turbostar', 172: 'Turbostar', 195: 'CAF Civity', 196: 'CAF Civity', 230: 'Class 230',
  331: 'CAF Civity', 333: 'Class 333', 323: 'Class 323', 350: 'Desiro', 755: 'Stadler FLIRT', 745: 'Stadler FLIRT', 756: 'Stadler', 769: 'Flex',
};

// type -> behaviour
const TYPES = {
  intercity: { first: (c) => Math.max(1, Math.round(c * 0.25)), catering: true, bikes: true, amenities: ['Power sockets', 'USB', 'WiFi', 'Toilets', 'Accessible toilet', 'Cycle spaces', 'Luggage racks', 'Catering'] },
  suburban: { first: () => 0, catering: false, bikes: true, amenities: ['Power sockets', 'Toilets', 'Accessible', 'Cycle spaces', 'Luggage racks'] },
  metro: { first: () => 0, catering: false, bikes: true, amenities: ['USB charging', 'WiFi', 'Accessible', 'Multi-purpose space', 'Walk-through'] },
  regional: { first: () => 0, catering: false, bikes: true, amenities: ['Toilets', 'Accessible', 'Cycle spaces', 'Luggage racks'] },
};
const CLASS_TYPE = {
  800: 'intercity', 801: 'intercity', 802: 'intercity', 803: 'intercity', 805: 'intercity', 807: 'intercity', 390: 'intercity', 220: 'intercity', 221: 'intercity', 222: 'intercity', 43: 'intercity', 175: 'intercity', 180: 'intercity', 185: 'intercity', 397: 'intercity', 68: 'intercity', 91: 'intercity', 755: 'intercity', 745: 'intercity', 756: 'intercity',
  345: 'metro', 700: 'metro', 707: 'metro', 710: 'metro', 717: 'metro', 720: 'metro', 701: 'metro', 378: 'metro', 357: 'metro', 376: 'metro',
  387: 'suburban', 377: 'suburban', 379: 'suburban', 375: 'suburban', 360: 'suburban', 350: 'suburban', 444: 'suburban', 450: 'suburban', 333: 'suburban', 323: 'suburban', 331: 'suburban',
  158: 'regional', 159: 'regional', 156: 'regional', 150: 'regional', 153: 'regional', 165: 'regional', 166: 'regional', 168: 'regional', 170: 'regional', 171: 'regional', 172: 'regional', 195: 'regional', 196: 'regional', 230: 'regional', 769: 'regional',
};

function stockName(cls) {
  if (!cls) return null;
  const n = CLASSES[parseInt(cls, 10)];
  return n ? `Class ${cls} · ${n}` : `Class ${cls}`;
}

// Build a representative coach layout for a class + coach count.
function layout(cls, cars, serviceType) {
  cars = parseInt(cars, 10) || 0;
  const key = parseInt(cls, 10);
  let type = CLASS_TYPE[key];
  if (!type) type = /Express|Charter/i.test(serviceType || '') ? 'intercity' : 'regional';
  const cfg = TYPES[type];
  const name = stockName(cls);
  if (!cars) return { name, type, coaches: [], amenities: cfg.amenities };

  const firstN = Math.min(cars, cfg.first(cars));
  const coaches = [];
  for (let i = 0; i < cars; i++) coaches.push({ first: i < firstN, access: false, bike: false, cater: false, lug: false });

  const accIdx = Math.min(cars - 1, firstN);            // first standard coach
  coaches[accIdx].access = true;
  if (cfg.catering && cars >= 4) coaches[Math.min(cars - 1, Math.floor(cars / 2))].cater = true;
  if (cfg.bikes) { coaches[cars - 1].bike = true; coaches[cars - 1].lug = true; }
  else coaches[cars - 1].lug = true;

  return { name, type, coaches, amenities: cfg.amenities };
}

const AMENITY_ICON = {
  'Power sockets': '🔌', 'USB': '🔌', 'USB charging': '🔌', 'WiFi': '📶', 'Toilets': '🚻',
  'Accessible toilet': '♿', 'Accessible': '♿', 'Cycle spaces': '🚲', 'Luggage racks': '🧳',
  'Catering': '🍴', 'Multi-purpose space': '🧍', 'Walk-through': '↔️',
};
const amenityIcon = (a) => AMENITY_ICON[a] || '•';

module.exports = { layout, stockName, amenityIcon, CLASSES };
