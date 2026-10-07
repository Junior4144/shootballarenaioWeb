import { cp, mkdir } from 'node:fs/promises';
await mkdir(new URL('../apps/web/dist/admin/', import.meta.url), { recursive: true });
await cp(new URL('../apps/admin/dist/', import.meta.url), new URL('../apps/web/dist/admin/', import.meta.url), { recursive: true });
console.log('Combined static site: apps/web/dist; separate admin entry: /admin/');
