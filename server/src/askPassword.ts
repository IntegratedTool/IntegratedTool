import readline from 'node:readline';

/** Asks for the database password in the terminal, without echoing it. Nothing is written to disk or logged. */
export function askPassword(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      // Non-interactive (e.g. piped input): read one line. Still never taken from a file or environment.
      const rl = readline.createInterface({ input: stdin });
      rl.once('line', (l) => { rl.close(); resolve(l); });
      rl.once('close', () => resolve(''));
      process.stdout.write(prompt);
      return;
    }
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n' || c === '\u0004') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (c === '\u0003') { // Ctrl+C
          stdin.setRawMode(false);
          reject(new Error('Cancelled'));
          return;
        }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on('data', onData);
  });
}

/** Ordinary (echoed) one-line question, e.g. a user name or a yes/no confirmation. */
export function askLine(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (a) => { rl.close(); resolve(a); });
  });
}
