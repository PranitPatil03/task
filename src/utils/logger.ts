function timestamp(): string {
  return new Date().toTimeString().slice(0, 8); // HH:MM:SS
}

const W = 60;

export const logger = {
  section: (title: string) => {
    const line = '━'.repeat(W);
    console.log(`\n${line}`);
    console.log(` ${title}`);
    console.log(`${line}`);
  },

  request: (msg: string) =>
    console.log(`[${timestamp()}] [REQUEST]   ${msg}`),

  db: (msg: string) =>
    console.log(`[${timestamp()}] [DB]        ${msg}`),

  parse: (msg: string) =>
    console.log(`[${timestamp()}] [PARSE]     ${msg}`),

  validate: (msg: string) =>
    console.log(`[${timestamp()}] [VALIDATE]  ${msg}`),

  result: (msg: string) =>
    console.log(`[${timestamp()}] [RESULT]    ${msg}`),

  error: (msg: string) =>
    console.error(`[${timestamp()}] [ERROR]     ${msg}`),
};
