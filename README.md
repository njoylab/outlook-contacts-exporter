# Outlook Contacts Exporter

Outlook for Mac exports contacts inside `.olm` backup files, which are basically a dead-end format.
I needed a way to get my contacts back in a usable form, so I built this.

This tool extracts contacts from an Outlook for Mac `.olm` file and exports them as **CSV** and **vCard (`.vcf`)**.
It includes both a **CLI** and a small **client-side web UI**.

A hosted version of the same client-side web UI is available here:
https://outlook-contacts.echovalue.dev/

![Outlook Contacts Exporter demo](assets/demo.gif)

---

## Why this exists

- Outlook for Mac only exports `.olm`
- Most existing tools are paid, Windows-only, or require uploading your data
- I wanted something **local**, **simple**, and **open-source**

No cloud, no accounts, no lock-in.

---

## Features

- **Offline by design**  
  All processing happens locally. No uploads, no servers.

- **CSV and vCard export**  
  Import contacts into Gmail, iCloud, CRMs, or anything else.

- **Frequent contacts detection**  
  Optionally parses sent messages to identify people you interact with most.

- **CLI + Web UI**  
  Use it in scripts or via a simple browser interface.

- **No Outlook required**  
  You only need the exported `.olm` file.

---

## Quick Start (CLI)

```bash
npm install
unzip backup.olm -d olm_extracted
npm run extract ./olm_extracted ./output
```

This generates:

- `contacts.csv`
- `contacts-frequent.csv`
- `contacts.vcf`

---

## Quick Start (Web UI)

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5173/` and upload a `.olm` file.

The web UI runs **entirely client-side**:  
your `.olm` file never leaves your machine.

A hosted version of the same client-side UI is available here:
https://outlook-contacts.echovalue.dev/

---

## How to Export an OLM File (Outlook for Mac)

1. Open Outlook and select your mailbox
2. Go to **File → Export**
3. Choose **Outlook for Mac Data File (.olm)**
4. Select what to export and continue
5. Save the file

You can then extract or upload the `.olm` file to this tool.

**Note:** Windows Outlook exports `.pst` files, which are not supported.

---

## Privacy

All processing happens locally.
No files are uploaded, stored, or tracked in any way.

---

## Limitations

- Only supports Outlook for **Mac**
- Only `.olm` files (no `.pst`)
- Contact extraction is based on Outlook’s internal data format and may miss edge cases

---

## Contributing

Contributions are welcome.
See `AGENTS.md` for repository guidelines and common commands.

---

## License

MIT. See `LICENSE`.
