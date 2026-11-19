import subprocess
node='/home/agent/.npm/_npx/361c55be1121897e/node_modules/node/bin/node'
subprocess.run([node,'../../node_modules/typescript/bin/tsc','-p','tsconfig.build.json'],check=True)
subprocess.run([node,'stamp-build.mjs'],check=True)
