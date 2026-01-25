# Build Instructions

These commands assume the project root is `/home/chb/Documents/DEV/APP`.

## Install

```bash
cd /home/chb/Documents/DEV/APP
npm install
```

## Run (Dev)

```bash
npm run dev
npm run dev -- --host --port 5173 # if remote access
```

## (Optional) HTTPS Dev Server

Requires `certs/dev-key.pem` and `certs/dev-cert.pem` in the project root.

```bash
VITE_DEV_HTTPS=true npm run dev -- --host
```

## (Optional) Debug GPS Input

Enables the manual GPS override panel in the HUD.

```bash
VITE_DEBUG_GPS=true npm run dev
```

## Build

```bash
npm run build
```

## Preview Production Build

```bash
npm run preview
```

## (Optional) Scaffold From Scratch

Only use this if you want to create a fresh project in a new folder.

```bash
npm create vite@latest pwa-location-game -- --template react-ts
cd pwa-location-game
npm install
npm install maplibre-gl vite-plugin-pwa
```
