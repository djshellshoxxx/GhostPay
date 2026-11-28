export function disableRetries(args) {
  const output = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--retries') {
      if (args[index + 1] && !args[index + 1].startsWith('--')) index += 1;
      continue;
    }
    if (argument.startsWith('--retries=')) continue;
    output.push(argument);
  }
  return [...output, '--retries=0'];
}
