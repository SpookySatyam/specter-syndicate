import { getTerrainHeight } from './src/levelGeometry.js';

const h0 = getTerrainHeight(0, 0);
const h1 = getTerrainHeight(0.1, 0);
const h2 = getTerrainHeight(0, 0.1);

console.log("h(0,0) =", h0);
console.log("h(0.1,0) =", h1, " slopeX =", Math.abs(h1 - h0) / 0.1);
console.log("h(0,0.1) =", h2, " slopeZ =", Math.abs(h2 - h0) / 0.1);
