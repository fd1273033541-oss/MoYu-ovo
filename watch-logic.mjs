export function validDescriptor(value) {
  return value?.length === 128 && Array.from(value).every(Number.isFinite);
}

export function distance(a, b) {
  if (!validDescriptor(a) || !validDescriptor(b)) return Infinity;
  return Math.hypot(...Array.from(a, (v, i) => v - b[i]));
}

export function overlap(a, b) {
  const area = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return area / Math.max(1, a.width * a.height + b.width * b.height - area);
}

// A face must belong unambiguously to one body. Never silence every body
// merely because an owner's face is somewhere in the image.
export function labelPeople(bodies, faces, samples) {
  const people = bodies.map(box => ({ box, identity: 'unknown' }));
  const ownerFaces = [];
  faces.forEach(face => {
    const center = { x: face.box.x + face.box.width / 2, y: face.box.y + face.box.height / 2 };
    const candidates = people.filter(p => center.x >= p.box.x && center.x <= p.box.x + p.box.width &&
      center.y >= p.box.y && center.y <= p.box.y + p.box.height * 0.65);
    const isOwner = samples.length === 3 && Math.min(...samples.map(s => distance(face.descriptor, s))) <= 0.48;
    if (candidates.length === 1) {
      if (isOwner) ownerFaces.push(candidates[0]);
      else candidates[0].identity = 'other';
    } else if (!candidates.length) {
      people.push({ box: face.box, identity: isOwner ? 'owner' : 'other' });
    }
  });
  // At most one person may be suppressed by a single owner profile.
  const ownerCount = ownerFaces.length + people.filter(p => p.identity === 'owner').length;
  if (ownerCount === 1 && ownerFaces.length && ownerFaces[0].identity !== 'other') ownerFaces[0].identity = 'owner';
  if (ownerCount > 1) people.forEach(p => { if (p.identity === 'owner') p.identity = 'unknown'; });
  return people;
}

export class Tracker {
  constructor() { this.tracks = []; this.serial = 0; }
  update(people, now) {
    const available = new Set(this.tracks.filter(t => now - t.seen < 1500));
    const current = [];
    for (const person of people) {
      const best = [...available].sort((a, b) => overlap(b.box, person.box) - overlap(a.box, person.box))[0];
      let track = best && overlap(best.box, person.box) > 0.25 ? best : null;
      if (track) {
        available.delete(track);
        const shift = Math.hypot(person.box.x - track.box.x, person.box.y - track.box.y);
        track.activity = shift > Math.max(8, person.box.width * 0.06) ? '移动' : '停留';
        track.hits = now - track.seen > 1000 ? 1 : track.hits + 1;
      } else track = { id: ++this.serial, hits: 1, activity: '进入', alerted: false };
      Object.assign(track, person, { seen: now });
      current.push(track);
    }
    this.tracks = [...current, ...available].filter(t => now - t.seen < 1500);
    return current;
  }
}
