import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import sharp from 'sharp';

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.avif']);
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const thumbnailCacheDir = path.join(os.tmpdir(), 'photo-server-thumbs');

export async function createPhotoServer({ rootDir }) {
  const resolvedRoot = path.resolve(rootDir);
  const rootStats = await fsp.stat(resolvedRoot);

  if (!rootStats.isDirectory()) {
    throw new Error(`Photo root is not a directory: ${resolvedRoot}`);
  }

  await fsp.mkdir(thumbnailCacheDir, { recursive: true });

  const app = fastify({ logger: false });

  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: '/'
  });

  app.get('/api/list', async (request, reply) => {
    const relativeDir = normalizeRelativePath(request.query.dir ?? '');
    const absoluteDir = resolveInsideRoot(resolvedRoot, relativeDir);
    const entries = await fsp.readdir(absoluteDir, { withFileTypes: true });

    const folders = [];
    const images = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }

      const itemRelativePath = toPosixPath(path.join(relativeDir, entry.name));

      if (entry.isDirectory()) {
        folders.push({
          name: entry.name,
          path: itemRelativePath
        });
      } else if (entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase())) {
        const absoluteFile = path.join(absoluteDir, entry.name);
        const stats = await fsp.stat(absoluteFile);
        const metadata = await sharp(absoluteFile).metadata();

        images.push({
          name: entry.name,
          path: itemRelativePath,
          size: stats.size,
          width: metadata.width,
          height: metadata.height,
          modifiedAt: stats.mtime.toISOString(),
          url: `/image/${encodePathSegments(itemRelativePath)}`,
          thumbnailUrl: `/thumb/${encodePathSegments(itemRelativePath)}`
        });
      }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name));
    images.sort((a, b) => a.name.localeCompare(b.name));

    return reply.send({
      root: path.basename(resolvedRoot),
      dir: relativeDir,
      parent: relativeDir ? toPosixPath(path.dirname(relativeDir)) : null,
      folders,
      images
    });
  });

  app.get('/image/*', async (request, reply) => {
    const relativeFile = normalizeRelativePath(request.params['*']);
    const absoluteFile = resolveInsideRoot(resolvedRoot, relativeFile);
    const extension = path.extname(absoluteFile).toLowerCase();

    if (!imageExtensions.has(extension)) {
      return reply.code(404).send({ error: 'Not found' });
    }

    return reply.sendFile(path.basename(absoluteFile), path.dirname(absoluteFile));
  });

  app.get('/thumb/*', async (request, reply) => {
    const relativeFile = normalizeRelativePath(request.params['*']);
    const absoluteFile = resolveInsideRoot(resolvedRoot, relativeFile);
    const stats = await fsp.stat(absoluteFile);
    const extension = path.extname(absoluteFile).toLowerCase();

    if (!stats.isFile() || !imageExtensions.has(extension)) {
      return reply.code(404).send({ error: 'Not found' });
    }

    const thumbnailFile = getThumbnailCacheFile(resolvedRoot, relativeFile, stats);

    try {
      await fsp.access(thumbnailFile);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }

      await sharp(absoluteFile)
        .rotate()
        .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 72, effort: 4 })
        .toFile(thumbnailFile);
    }

    return reply
      .type('image/webp')
      .header('Cache-Control', 'public, max-age=3600')
      .sendFile(path.basename(thumbnailFile), path.dirname(thumbnailFile));
  });

  app.get('/download/*', async (request, reply) => {
    const relativeFile = normalizeRelativePath(request.params['*']);
    const absoluteFile = resolveInsideRoot(resolvedRoot, relativeFile);
    const stats = await fsp.stat(absoluteFile);
    const extension = path.extname(absoluteFile).toLowerCase();

    if (!stats.isFile() || !imageExtensions.has(extension)) {
      return reply.code(404).send({ error: 'Not found' });
    }

    reply.header('Content-Disposition', contentDisposition(path.basename(absoluteFile)));
    return reply.sendFile(path.basename(absoluteFile), path.dirname(absoluteFile));
  });

  app.setNotFoundHandler((request, reply) => {
    if (
      request.raw.url?.startsWith('/api/')
      || request.raw.url?.startsWith('/image/')
      || request.raw.url?.startsWith('/thumb/')
      || request.raw.url?.startsWith('/download/')
    ) {
      return reply.code(404).send({ error: 'Not found' });
    }

    return reply.sendFile('index.html');
  });

  return app;
}

function resolveInsideRoot(rootDir, relativePath) {
  const resolved = path.resolve(rootDir, relativePath);
  const relative = path.relative(rootDir, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes photo root: ${relativePath}`);
  }

  return resolved;
}

function normalizeRelativePath(value) {
  const normalized = path.normalize(String(value).replaceAll('\\', '/'));
  return normalized === '.' ? '' : normalized;
}

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function encodePathSegments(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

function contentDisposition(filename) {
  const fallback = filename.replaceAll(/["\\\r\n]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function getThumbnailCacheFile(rootDir, relativeFile, stats) {
  const cacheKey = createHash('sha256')
    .update(rootDir)
    .update('\0')
    .update(relativeFile)
    .update('\0')
    .update(String(stats.size))
    .update('\0')
    .update(String(stats.mtimeMs))
    .digest('hex');

  return path.join(thumbnailCacheDir, `${cacheKey}.webp`);
}
