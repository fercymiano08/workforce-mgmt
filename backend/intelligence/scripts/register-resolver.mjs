import { register } from 'node:module';

register(new URL('./ext-resolver.mjs', import.meta.url));
