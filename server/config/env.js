import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Always load the project's .env file, even when Node is started from another
// working directory (for example by an IDE, process manager, or hosting tool).
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

dotenv.config({ path: path.join(projectRoot, '.env') });

export { projectRoot };
