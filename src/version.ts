import { createRequire } from 'module';

// package.json sits one level above both src/ and dist/
export const VERSION: string = createRequire(import.meta.url)('../package.json').version;
