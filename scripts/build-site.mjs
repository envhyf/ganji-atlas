import { cp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// One release ID for code and immutable data paths prevents mixed seat indices.
const version = process.env.GITHUB_SHA || execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if (!/^[a-f0-9]{40}$/.test(version)) throw new Error('Invalid release ID');
const out = process.argv[2] || 'dist';
await mkdir(out,{recursive:true});
await cp('site',out,{recursive:true});
await mkdir(join(out,'releases',version),{recursive:true});
await cp(join(out,'data'),join(out,'releases',version,'data'),{recursive:true});
await cp(join(out,'js'),join(out,'releases',version,'js'),{recursive:true});
await cp(join(out,'css'),join(out,'releases',version,'css'),{recursive:true});
for (const name of await readdir(join(out,'js'))) {
  if (!name.endsWith('.js')) continue;
  const file=join(out,'releases',version,'js',name);
  let source=await readFile(file,'utf8');
  source=source.replace(/(from ['"])(\.\/[^'"?]+)(?:\?[^'"]*)?(['"])/g,(_,a,b,c)=>`${a}${b}?v=${version}${c}`);
  source=source.replace("const DATA_ROOT = 'data/';",`const DATA_ROOT = 'releases/${version}/data/';`);
  await writeFile(file,source);
}
const html=join(out,'index.html');
await writeFile(html,(await readFile(html,'utf8')).replace(/((?:css|js)\/[^"?]+)(?:\?[^" ]*)?/g,(_,path)=>`releases/${version}/${path}`));
console.log(`Built ${out} with release ${version}`);
