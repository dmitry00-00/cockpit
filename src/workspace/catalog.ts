import { parsePackageManifest, type PackageManifest } from '../packages/manifest';
const manifests=import.meta.glob('../../packages/*/package.json',{import:'default'});
export async function loadPackageCatalog():Promise<PackageManifest[]> {
 return (await Promise.all(Object.values(manifests).map(load=>load()))).map(parsePackageManifest).sort((a,b)=>a.id.localeCompare(b.id));
}
