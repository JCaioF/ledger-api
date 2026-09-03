import { execSync } from 'node:child_process';

export default function () {
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
}
