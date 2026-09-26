/**
 * levelGeometry.js — Shared source of truth for collision/occlusion geometry.
 */

export const PILLAR_RADIUS = 0.6;
export const BOUNDS = 18;
export const PLAYABLE_BOUNDS = 17.4;

export const PROP_CRATES = [
  { pos: [-2, -8],   size: [0.7, 0.7, 0.7],  rotY: 0.3 },
  { pos: [8, -2],    size: [0.9, 0.5, 0.6],  rotY: 0.8 },
  { pos: [-9, 2],    size: [0.6, 0.6, 0.6],  rotY: -0.4 },
  { pos: [2, 10],    size: [0.5, 0.8, 0.5],  rotY: 1.1 },
  { pos: [-14, -8],  size: [1.0, 0.4, 0.6],  rotY: 0 },
];

export const PROP_BARRELS = [
  { pos: [12, 10],  radius: 0.3, height: 0.8 },
  { pos: [-6, 10],  radius: 0.35, height: 1.0 },
];

export const LEVEL_OBJECTIVES = {
  1: { core: [16, 16], extraction: [-16, -16] },
  2: { core: [16, 16], extraction: [-16, -16] },
  3: { core: [16, 16], extraction: [-16, -16] },
};

export function getObjectiveForLevel(level) {
  return LEVEL_OBJECTIVES[level] || LEVEL_OBJECTIVES[1];
}

/**
 * Circle to Circle collision
 */
function circleCollidesCircle(x1, z1, r1, x2, z2, r2) {
  const dx = x1 - x2;
  const dz = z1 - z2;
  const minDist = r1 + r2;
  return dx * dx + dz * dz < minDist * minDist;
}

/**
 * Circle to AABB Box collision
 */
function circleCollidesAABB(cx, cz, cr, bx, bz, halfW, halfH) {
  const closestX = Math.max(bx - halfW, Math.min(cx, bx + halfW));
  const closestZ = Math.max(bz - halfH, Math.min(cz, bz + halfH));
  const dx = cx - closestX;
  const dz = cz - closestZ;
  return dx * dx + dz * dz < cr * cr;
}

/**
 * Pure math obstacle collision check for any entity of radius entityRadius.
 */
export function checkObstacleCollision(x, z, level, entityRadius = 0.5) {
  // 1. Playable Bounds check
  if (Math.abs(x) > PLAYABLE_BOUNDS || Math.abs(z) > PLAYABLE_BOUNDS) {
    return true;
  }

  // 2. Pillars check
  const pillars = getPillarsForLevel(level);
  for (let i = 0; i < pillars.length; i++) {
    const px = pillars[i][0];
    const pz = pillars[i][1];

    let shape = 'cylinder';
    if (level === 2) {
      shape = i % 2 === 0 ? 'hex' : 'cylinder';
    } else if (level === 3) {
      shape = i % 3 === 0 ? 'box' : 'cylinder';
    }

    if (shape === 'box') {
      if (circleCollidesAABB(x, z, entityRadius, px, pz, PILLAR_RADIUS, PILLAR_RADIUS)) {
        return true;
      }
    } else {
      if (circleCollidesCircle(x, z, entityRadius, px, pz, PILLAR_RADIUS)) {
        return true;
      }
    }
  }

  // 3. Crates check
  for (let i = 0; i < PROP_CRATES.length; i++) {
    const c = PROP_CRATES[i];
    const halfX = c.size[0] / 2;
    const halfZ = c.size[2] / 2;
    if (circleCollidesAABB(x, z, entityRadius, c.pos[0], c.pos[1], halfX, halfZ)) {
      return true;
    }
  }

  // 4. Barrels check
  for (let i = 0; i < PROP_BARRELS.length; i++) {
    const b = PROP_BARRELS[i];
    if (circleCollidesCircle(x, z, entityRadius, b.pos[0], b.pos[1], b.radius)) {
      return true;
    }
  }

  return false;
}


// ---------------------------------------------------------------------------
// Terrain / Noise
// ---------------------------------------------------------------------------
const PERMUTATION = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
const P = new Array(512);
for (let i = 0; i < 256; i++) {
  P[i] = PERMUTATION[i];
  P[i + 256] = PERMUTATION[i];
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(t, a, b) { return a + t * (b - a); }
function grad(hash, x, y) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function noise2D(x, y) {
  let X = Math.floor(x) & 255;
  let Y = Math.floor(y) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  const u = fade(x);
  const v = fade(y);
  const A = P[X] + Y;
  const B = P[X + 1] + Y;
  
  return lerp(v, lerp(u, grad(P[A], x, y), grad(P[B], x - 1, y)),
                 lerp(u, grad(P[A + 1], x, y - 1), grad(P[B + 1], x - 1, y - 1)));
}

export function getTerrainHeight(x, z) {
  const nx = x * 0.08;
  const nz = z * 0.08;
  let n = noise2D(nx, nz) + 0.5 * noise2D(nx * 2 + 10.5, nz * 2 + 10.5);
  
  let height = (n + 1.0) * 1.5;
  if (height < 0) height = 0;
  
  const dist = Math.sqrt(x*x + z*z);
  if (dist > 20) {
    height *= 1.0 + (dist - 20) * 0.15;
  }
  
  return height;
}

export const LEVEL_PILLAR_LAYOUTS = {
  1: [
    // Near Patrol A corners — cover to duck behind as the center hunter turns
    [-4, -4],
    [4, -4],
    [4, 4],
    [-4, 4],
    // Between Patrol B and the center — mid-lane cover
    [-8, -6],
    [-3, -6],
    // Near Patrol C — NE triangle cover
    [7, 6],
    [10, 8],
    // Open-field cover islands — force the player to plan a route
    [0, 0],       // dead center pillar
    [-10, 5],     // NW pocket
    [14, -4],     // east side
    [-14, -14],   // far SW corner
  ],
  2: (() => {
    const layout = [];
    // 8 inner ring
    for (let i = 0; i < 8; i++) {
      const angle = i * (Math.PI * 2 / 8);
      layout.push([Math.cos(angle) * 7, Math.sin(angle) * 7]);
    }
    // 6 outer ring
    for (let i = 0; i < 6; i++) {
      const angle = i * (Math.PI * 2 / 6) + 0.5;
      layout.push([Math.cos(angle) * 13, Math.sin(angle) * 13]);
    }
    return layout;
  })(),
  3: [
    // Scattered diagonal lines
    [-12, -12], [-8, -9], [-4, -6], [0, -3],
    [12, 12], [8, 9], [4, 6], [0, 3],
    [-10, 8], [-6, 12], [-2, 16],
    [10, -8], [6, -12], [2, -16],
  ]
};

export function getPillarsForLevel(level) {
  return LEVEL_PILLAR_LAYOUTS[level] || LEVEL_PILLAR_LAYOUTS[1];
}

export const HEALTH_PACK_POSITIONS = [
  [-12, 12],  // North-West corner
  [12, -12],  // South-East corner
  [8, -2],    // East-mid 
  [-2, 12],   // North-mid
];

export function getEscapeDirection(x, z, level) {
  const pillars = getPillarsForLevel(level);
  let bestDistSq = Infinity;
  let secondBestDistSq = Infinity;
  let bestPillar = null;
  let secondBestPillar = null;

  for (let i = 0; i < pillars.length; i++) {
    const px = pillars[i][0];
    const pz = pillars[i][1];
    const dx = x - px;
    const dz = z - pz;
    const distSq = dx * dx + dz * dz;

    if (distSq < bestDistSq) {
      secondBestDistSq = bestDistSq;
      secondBestPillar = bestPillar;
      bestDistSq = distSq;
      bestPillar = pillars[i];
    } else if (distSq < secondBestDistSq) {
      secondBestDistSq = distSq;
      secondBestPillar = pillars[i];
    }
  }

  if (!bestPillar) return { x: 1, z: 0 };

  let outX = x - bestPillar[0];
  let outZ = z - bestPillar[1];
  let outLen = Math.sqrt(outX * outX + outZ * outZ);
  if (outLen > 0) {
    outX /= outLen;
    outZ /= outLen;
  }

  if (secondBestPillar) {
    const bestDist = Math.sqrt(bestDistSq);
    const secondDist = Math.sqrt(secondBestDistSq);
    if (secondDist <= bestDist * 1.5) {
      let outX2 = x - secondBestPillar[0];
      let outZ2 = z - secondBestPillar[1];
      let outLen2 = Math.sqrt(outX2 * outX2 + outZ2 * outZ2);
      if (outLen2 > 0) {
        outX2 /= outLen2;
        outZ2 /= outLen2;
      }
      outX = (outX + outX2) / 2;
      outZ = (outZ + outZ2) / 2;
      const newLen = Math.sqrt(outX * outX + outZ * outZ);
      if (newLen > 0) {
        outX /= newLen;
        outZ /= newLen;
      } else {
        outX = x - bestPillar[0];
        outZ = z - bestPillar[1];
        if (outLen > 0) { outX /= outLen; outZ /= outLen; }
      }
    }
  }

  if (outX === 0 && outZ === 0) return { x: 1, z: 0 };
  return { x: outX, z: outZ };
}
