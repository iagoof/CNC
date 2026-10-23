import { build } from 'esbuild';
import { cp, mkdir, writeFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const revision=execFileSync('git',['rev-parse','--short=12','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const output=path.join(root,'.tools','hosting',revision);
const archive=path.join(root,'.tools','hosting',`cnc-${revision}.tar.gz`);
await mkdir(output,{recursive:true});
await build({entryPoints:[path.join(root,'server.ts')],outfile:path.join(output,'server.js'),bundle:true,platform:'node',target:'node22',format:'esm',
  external:['vite'],minifySyntax:true,
  banner:{js:"import {createRequire as createNodeRequire} from 'node:module';const require=createNodeRequire(import.meta.url);"},
  define:{'process.env.NODE_ENV':JSON.stringify('production'),'process.env.APP_BUILD_REVISION':JSON.stringify(revision)}
});
await cp(path.join(root,'dist'),path.join(output,'dist'),{recursive:true});
await writeFile(path.join(output,'package.json'),JSON.stringify({name:'cnc-app',private:true,type:'module',scripts:{start:'node server.js'}})+'\n');
execFileSync('tar',['-czf',archive,'-C',output,'.'],{cwd:root});
const bytes=(await stat(archive)).size;
if(bytes>250*1024*1024)throw new Error('O pacote excede o limite de 250 MiB do Cloud Run.');
console.log(JSON.stringify({revision,output,archive,bytes},null,2));
