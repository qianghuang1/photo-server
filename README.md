# Photo Server

A Node.js CLI that hosts a local web gallery for reviewing photos under a folder.

## Features

- Browse folders from the web UI
- View photos in ratio-preserving thumbnail tiles
- Open original images in a PhotoSwipe gallery
- Generate compressed thumbnails into the OS temp folder, not the source photo folder
- Multi-select photos and download selected files individually

## Usage

```sh
npm install
node ./bin/photo-server.js .
```

```
npm install -g photo-server
photo-server .
```

Options:

```sh
photo-server [folder] --host 127.0.0.1 --port 3000
```

To install the CLI command locally:

```sh
npm link
photo-server .
```

Open the printed URL in a browser to review the photos.

## Thumbnail cache

Thumbnails are cached as `.webp` files in the OS temp directory:

```sh
photo-server-thumbs
```

The original photo folder is not modified.
