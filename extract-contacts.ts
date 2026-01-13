import { readdir, readFile, writeFile, mkdir, rm, mkdtemp } from "fs/promises";
import { parseStringPromise } from "xml2js";
import { join } from "path";
import { existsSync, statSync } from "fs";
import AdmZip from "adm-zip";
import { tmpdir } from "os";

interface Contact {
  email: string;
  name: string;
  source: "from" | "to" | "cc" | "bcc";
  count: number;
}

type ContactMap = Map<string, Contact>;

function extractEmailFromString(str: string): { email: string; name: string } | null {
  if (!str || typeof str !== "string") return null;

  // Format: "Name <email@example.com>" or just "email@example.com"
  const bracketMatch = str.match(/^(.+?)\s*<([^>]+)>$/);
  if (bracketMatch) {
    return {
      name: bracketMatch[1].trim().replace(/^["']|["']$/g, ""),
      email: bracketMatch[2].trim().toLowerCase(),
    };
  }

  // Just email
  const emailMatch = str.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) {
    return {
      name: "",
      email: emailMatch[0].toLowerCase(),
    };
  }

  return null;
}

function extractEmailsFromValue(value: unknown): { email: string; name: string }[] {
  const results: { email: string; name: string }[] = [];

  if (!value) return results;

  if (typeof value === "string") {
    // Could be comma or semicolon separated
    const parts = value.split(/[;,]/);
    for (const part of parts) {
      const extracted = extractEmailFromString(part.trim());
      if (extracted) results.push(extracted);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      results.push(...extractEmailsFromValue(item));
    }
  }

  return results;
}

function getNestedValue(obj: unknown, keys: string[]): unknown {
  let current = obj;
  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

function extractContactsFromParsed(parsed: unknown, contacts: ContactMap, extractFromPreview: boolean = false): void {
  if (!parsed || typeof parsed !== "object") return;

  // OLM XML structure with attributes: xml2js puts attributes in $ property
  const emailFields: { key: string; source: Contact["source"] }[] = [
    { key: "OPFMessageCopyFromAddresses", source: "from" },
    { key: "OPFMessageCopyToAddresses", source: "to" },
    { key: "OPFMessageCopyCCAddresses", source: "cc" },
    { key: "OPFMessageCopyBCCAddresses", source: "bcc" },
    { key: "OPFMessageCopyReplyToAddresses", source: "from" },
  ];

  function extractEmailFromAttributes(attrs: unknown): { email: string; name: string } | null {
    if (!attrs || typeof attrs !== "object") return null;
    const attrsObj = attrs as Record<string, unknown>;

    const email = attrsObj["OPFContactEmailAddressAddress"];
    const name = attrsObj["OPFContactEmailAddressName"];

    if (typeof email === "string" && email.includes("@")) {
      return {
        email: email.toLowerCase(),
        name: typeof name === "string" ? name : "",
      };
    }

    return null;
  }

  function extractEmailsFromPreview(previewText: string): { email: string; name: string; source: Contact["source"] }[] {
    const results: { email: string; name: string; source: Contact["source"] }[] = [];

    // Decode HTML entities (&lt; -> <, &gt; -> >)
    const decodedText = previewText
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Match patterns like: "From: Name <email@example.com>" or "To: Name <email@example.com>"
    // Note: Don't use ^ anchor since preview may have text before email headers
    const headerRegex = /(From|To|Cc):\s*(.+?)\s*<([^>]+)>/gim;

    let match;
    while ((match = headerRegex.exec(decodedText)) !== null) {
      const headerType = match[1].toLowerCase();
      const name = match[2].trim();
      const email = match[3].trim();

      if (email.includes("@")) {
        let source: Contact["source"];
        if (headerType === "from") source = "from";
        else if (headerType === "to") source = "to";
        else if (headerType === "cc") source = "cc";
        else continue;

        results.push({
          email: email.toLowerCase(),
          name: name,
          source: source,
        });
      }
    }

    return results;
  }

  function searchObject(obj: unknown, currentSource?: Contact["source"]): void {
    if (!obj || typeof obj !== "object") return;

    const record = obj as Record<string, unknown>;

    // Check if this is an emailAddress element with attributes
    if ("$" in record) {
      const extracted = extractEmailFromAttributes(record["$"]);
      if (extracted && currentSource) {
        const { email, name } = extracted;
        const existing = contacts.get(email);
        if (existing) {
          existing.count++;
          if (name && !existing.name) {
            existing.name = name;
          }
        } else {
          contacts.set(email, { email, name, source: currentSource, count: 1 });
        }
      }
    }

    // Check for email field containers
    for (const { key, source } of emailFields) {
      if (key in record) {
        const value = record[key];
        searchObject(value, source);
      }
    }

    // Extract from preview text if flag is enabled
    if (extractFromPreview && "OPFMessageCopyPreview" in record) {
      const previewValue = record["OPFMessageCopyPreview"];
      let previewText: string | undefined;

      // xml2js puts text content in "_" property when ignoreAttrs is false
      if (typeof previewValue === "string") {
        previewText = previewValue;
      } else if (previewValue && typeof previewValue === "object" && "_" in previewValue) {
        const textValue = (previewValue as Record<string, unknown>)["_"];
        if (typeof textValue === "string") {
          previewText = textValue;
        }
      }

      if (previewText) {
        const previewEmails = extractEmailsFromPreview(previewText);
        for (const { email, name, source } of previewEmails) {
          const existing = contacts.get(email);
          if (existing) {
            existing.count++;
            if (name && !existing.name) {
              existing.name = name;
            }
          } else {
            contacts.set(email, { email, name, source, count: 1 });
          }
        }
      }
    }

    // Recurse into nested objects
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          searchObject(item, currentSource);
        }
      } else if (typeof value === "object") {
        searchObject(value, currentSource);
      }
    }
  }

  searchObject(parsed);
}

async function processDirectory(dir: string, contacts: ContactMap, extractFromPreview: boolean = false): Promise<number> {
  let fileCount = 0;

  async function processDir(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const path = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await processDir(path);
      } else if (entry.name.endsWith(".xml")) {
        try {
          const xml = await readFile(path, "utf-8");
          const parsed = await parseStringPromise(xml, {
            explicitArray: false,
            ignoreAttrs: false,
          });
          extractContactsFromParsed(parsed, contacts, extractFromPreview);
          fileCount++;

          if (fileCount % 100 === 0) {
            console.log(`Processed ${fileCount} files, found ${contacts.size} unique contacts...`);
          }
        } catch (err) {
          // Skip unparseable files
        }
      }
    }
  }

  await processDir(dir);
  return fileCount;
}

async function extractOlmFile(olmPath: string): Promise<string> {
  console.log(`Extracting ${olmPath}...`);

  // Create temporary directory
  const tempDir = await mkdtemp(join(tmpdir(), "olm-extract-"));

  try {
    const zip = new AdmZip(olmPath);
    zip.extractAllTo(tempDir, true);
    console.log(`Extracted to temporary directory: ${tempDir}`);
    return tempDir;
  } catch (error) {
    // Clean up on error
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function escapeCSV(str: string): string {
  if (!str) return "";
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCSV(contacts: Contact[]): string {
  const header = "Email,Name,Source,Message Count";
  const rows = contacts.map(
    (c) => `${escapeCSV(c.email)},${escapeCSV(c.name)},${c.source},${c.count}`
  );
  return [header, ...rows].join("\n");
}

function generateVCard(contacts: Contact[]): string {
  return contacts
    .map((c) => {
      const nameParts = c.name ? c.name.split(" ") : [];
      const lastName = nameParts.length > 1 ? nameParts.pop() : "";
      const firstName = nameParts.join(" ");

      return [
        "BEGIN:VCARD",
        "VERSION:3.0",
        c.name ? `FN:${c.name}` : `FN:${c.email}`,
        c.name ? `N:${lastName};${firstName};;;` : `N:;;;;`,
        `EMAIL;TYPE=INTERNET:${c.email}`,
        `NOTE:Source: ${c.source}, Messages: ${c.count}`,
        "END:VCARD",
      ].join("\r\n");
    })
    .join("\r\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
OLM Contacts Extractor
======================

Usage: npx tsx extract-contacts.ts <olm-file-or-dir> [output-dir] [--extract-from-preview]

Input:
  You can provide either:
  - A .olm file (will be automatically extracted)
  - An already extracted directory

Examples:
  npx tsx extract-contacts.ts backup.olm ./output
  npx tsx extract-contacts.ts ./olm_extracted ./output --extract-from-preview

Options:
  --extract-from-preview  Also extract email addresses from message preview text.
                          This extracts recipients from sent messages where structured
                          data is not available, but may be less accurate.

Output:
- contacts.csv - All contacts with email, name, source, count
- contacts.vcf - vCard format for importing into address books
- contacts-frequent.csv - Only contacts with 3+ messages
`);
    process.exit(args.length === 0 ? 1 : 0);
  }

  // Parse flags
  const extractFromPreview = args.includes("--extract-from-preview");
  const nonFlagArgs = args.filter((arg) => !arg.startsWith("--"));

  const input = nonFlagArgs[0];
  const outputDir = nonFlagArgs[1] || "./output";

  if (!input) {
    console.error("Error: Input file or directory is required");
    process.exit(1);
  }

  if (!existsSync(input)) {
    console.error(`Error: File or directory not found: ${input}`);
    process.exit(1);
  }

  // Check if input is a file or directory
  const stats = statSync(input);
  let olmDir: string;
  let tempDir: string | null = null;

  if (stats.isFile()) {
    // Assume it's a .olm file (ZIP archive)
    if (!input.toLowerCase().endsWith(".olm")) {
      console.warn(`Warning: File doesn't have .olm extension, but will try to extract as ZIP archive`);
    }
    tempDir = await extractOlmFile(input);
    olmDir = tempDir;
  } else {
    olmDir = input;
  }

  try {
    console.log(`Scanning ${olmDir} for email messages...`);
    if (extractFromPreview) {
      console.log(`Extract from preview: ENABLED (may extract additional recipients from sent messages)`);
    }

    const contacts: ContactMap = new Map();
    const fileCount = await processDirectory(olmDir, contacts, extractFromPreview);

    console.log(`\nProcessed ${fileCount} XML files`);
    console.log(`Found ${contacts.size} unique email addresses`);

    // Sort by count descending
    const sortedContacts = Array.from(contacts.values()).sort((a, b) => b.count - a.count);

    // Create output directory
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    // Generate outputs
    const csvAll = generateCSV(sortedContacts);
    const csvFrequent = generateCSV(sortedContacts.filter((c) => c.count >= 3));
    const vcard = generateVCard(sortedContacts);

    await writeFile(join(outputDir, "contacts.csv"), csvAll, "utf-8");
    await writeFile(join(outputDir, "contacts-frequent.csv"), csvFrequent, "utf-8");
    await writeFile(join(outputDir, "contacts.vcf"), vcard, "utf-8");

    console.log(`\nOutput saved to ${outputDir}/`);
    console.log(`  - contacts.csv (${sortedContacts.length} contacts)`);
    console.log(`  - contacts-frequent.csv (${sortedContacts.filter((c) => c.count >= 3).length} contacts with 3+ messages)`);
    console.log(`  - contacts.vcf (vCard format)`);

    // Show top 10
    console.log(`\nTop 10 most frequent contacts:`);
    sortedContacts.slice(0, 10).forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.email} ${c.name ? `(${c.name})` : ""} - ${c.count} messages`);
    });
  } finally {
    // Clean up temporary directory if we created one
    if (tempDir) {
      console.log(`\nCleaning up temporary directory...`);
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

main().catch(console.error);
