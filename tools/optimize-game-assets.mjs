// Reproducible game delivery assets. Originals remain the art/scoring source.
import sharp from 'sharp';
import {readdir, readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const publicRoot = path.join(root, 'apps/web/public');
const output = path.join(publicRoot, 'game/optimized');
await mkdir(output, {recursive:true});
const manifest = {}, report = [];
for (const level of ['l1','l2','l3','l4']) {
  for (const name of (await readdir(path.join(publicRoot, 'game', level))).sort()) {
    if (!name.endsWith('.png')) continue;
    const source = await readFile(path.join(publicRoot, 'game', level, name));
    const encoded = await sharp(source).webp({quality:90, alphaQuality:100, effort:5}).toBuffer();
    const original = await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const decoded = await sharp(encoded).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    if (original.info.width !== decoded.info.width || original.info.height !== decoded.info.height) throw Error(`Dimensions changed: ${name}`);
    for (let i=3; i<original.data.length; i+=4) {
      if (original.data[i] !== decoded.data[i]) throw Error(`Alpha changed: ${name}`);
    }
    const hash = createHash('sha256').update(encoded).digest('hex').slice(0,16);
    const filename = `${level}-${name.slice(0,-4)}.${hash}.webp`;
    await writeFile(path.join(output, filename), encoded);
    manifest[`/game/${level}/${name}`] = `/game/optimized/${filename}`;
    report.push({level,name,original:source.length,optimized:encoded.length});
  }
}
await writeFile(path.join(root, 'apps/web/src/features/shared/asset-manifest.json'), JSON.stringify(manifest,null,2)+'\n');
await mkdir(path.join(root,'output'),{recursive:true});
await writeFile(path.join(root,'output/asset-optimization.json'),JSON.stringify(report,null,2));
for (const level of ['l1','l2','l3','l4']) {
  const rows=report.filter(r=>r.level===level);
  console.log(level, JSON.stringify({original:rows.reduce((s,r)=>s+r.original,0),optimized:rows.reduce((s,r)=>s+r.optimized,0),files:rows.length}));
}
