#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { createPhotoServer } from '../src/server.js';

const argv = yargs(hideBin(process.argv))
  .scriptName('photo-server')
  .usage('$0 [folder] [options]')
  .positional('folder', {
    describe: 'Folder containing photos to browse',
    default: '.',
    type: 'string'
  })
  .option('host', {
    alias: 'H',
    describe: 'Host to bind',
    default: '0.0.0.0',
    type: 'string'
  })
  .option('port', {
    alias: 'p',
    describe: 'Port to listen on',
    default: 1234,
    type: 'number'
  })
  .help()
  .alias('help', 'h')
  .parse();

const rootDir = path.resolve(process.cwd(), argv._[0] ?? '.');
const server = await createPhotoServer({ rootDir });

try {
  const address = await server.listen({ host: argv.host, port: argv.port });
  console.log(`Photo server is running at ${address}`);
  console.log(`Serving photos from ${rootDir}`);
} catch (error) {
  server.log.error(error);
  process.exitCode = 1;
}
