import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
for (const [source,target] of [['src/utils/calculations.ts','audit-calculations.mjs'],['src/utils/cncExporters.ts','audit-exporters.mjs'],['audit-checks.mts','audit-checks.mjs']]) {
 let code=fs.readFileSync(source,'utf8').replace("import { Machine, Material, FixedCost, UF, TaxConfig }", "import type { Machine, Material, FixedCost, UF, TaxConfig }").replace('./src/utils/calculations.ts','./audit-calculations.mjs').replace('./src/utils/cncExporters.ts','./audit-exporters.mjs');
 fs.writeFileSync(target,stripTypeScriptTypes(code));
}
