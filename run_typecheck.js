const { execSync } = require('child_process');
const fs = require('fs');
try {
  const output = execSync('npx vue-tsc --noEmit', { 
    encoding: 'utf8', 
    cwd: 'D:\\codes\\web',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  console.log(output);
  process.exit(0);
} catch (e) {
  const stderr = e.stderr || '';
  const stdout = e.stdout || '';
  fs.writeFileSync('D:\\codes\\web\\typecheck_errors.txt', stderr + stdout, 'utf8');
  console.log(stderr + stdout);
  process.exit(1);
}