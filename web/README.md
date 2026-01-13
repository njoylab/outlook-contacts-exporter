# Outlook Contacts Exporter (Web UI)

Client-side web app to extract contacts from Outlook for Mac `.olm` backups and download CSV or vCard files.

## Features
- Runs fully in the browser (no uploads)
- Exports CSV and `.vcf`
- Finds frequent contacts
- Optional sent-message parsing

## Quick Start
```bash
cd web
npm install
npm run dev
```
Open `http://localhost:5173/` and upload a `.olm` file.

## Build
```bash
cd web
npm run build
```

## Notes
- Windows Outlook exports `.pst`, which is not supported.
- All processing happens locally on your machine.
