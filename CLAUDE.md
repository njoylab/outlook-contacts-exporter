# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript utility that extracts contact information from Outlook OLM (Mac) backup files. The tool recursively scans XML files within an extracted OLM archive, parses email headers to extract sender and recipient information, and exports the data in multiple formats (CSV and vCard).

## Commands

```bash
# Install dependencies
npm install

# Run the contact extractor
npm run extract <olm-extracted-dir> [output-dir]

# Direct execution with tsx
npx tsx extract-contacts.ts <olm-extracted-dir> [output-dir]
```

### Workflow Example
```bash
# 1. Extract the .olm file first (OLM files are ZIP archives)
unzip backup.olm -d olm_extracted

# 2. Run the extraction script
npm run extract ./olm_extracted ./output
```

## Architecture

### Core Data Flow

The application follows a single-file architecture with a clear data flow:

1. **Directory Traversal** (`processDirectory`): Recursively walks the OLM directory structure looking for `.xml` files
2. **XML Parsing**: Uses `xml2js` to parse each XML file with `explicitArray: false` and `ignoreAttrs: true` settings
3. **Contact Extraction** (`extractContactsFromParsed`): Recursively searches parsed XML for known email field names:
   - `OPFMessageCopySenderAddress`, `OPFMessageCopyFromAddresses` (from)
   - `OPFMessageCopyToAddresses` (to)
   - `OPFMessageCopyCCAddresses` (cc)
   - `OPFMessageCopyBCCAddresses` (bcc)
   - Alternative fields: `senderAddress`, `toRecipients`, `ccRecipients`
4. **Deduplication**: Uses a `Map<string, Contact>` to deduplicate by email address, tracking occurrence count
5. **Export**: Generates three output files sorted by frequency

### Email Parsing Logic

The `extractEmailFromString` function handles two formats:
- `"Name <email@example.com>"` - Extracts both name and email
- `"email@example.com"` - Just the email address
- Supports multiple addresses separated by commas or semicolons

### Contact Data Structure

```typescript
interface Contact {
  email: string;      // Normalized to lowercase
  name: string;       // Display name (if available)
  source: "from" | "to" | "cc" | "bcc";  // First occurrence source
  count: number;      // Number of messages containing this contact
}
```

### Output Formats

1. **contacts.csv**: All contacts with headers: Email, Name, Source, Message Count
2. **contacts-frequent.csv**: Filtered to contacts appearing in 3+ messages
3. **contacts.vcf**: vCard 3.0 format for import into address books

## Key Implementation Details

- **Error Handling**: File parsing errors are silently caught to handle corrupted or non-standard XML files
- **Progress Reporting**: Logs every 100 files processed
- **Case Normalization**: All email addresses are converted to lowercase for consistent deduplication
- **CSV Escaping**: Proper handling of commas, quotes, and newlines in CSV output
- **Name Updating**: If a contact appears multiple times, the first non-empty name is retained
- **vCard Name Splitting**: Names are split into first/last name components for vCard N field

## TypeScript Configuration

The project uses ES modules (`"type": "module"` in package.json) and requires Node.js 20+ for the `fs/promises` API. No `tsconfig.json` is present, relying on `tsx` defaults for execution.
