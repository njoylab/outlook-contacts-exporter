import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import AdmZip from "adm-zip";
import {
  extractContactsFromParsed,
  extractEmailFromString,
  extractEmailsFromValue,
  extractOlmFile,
  generateCSV,
  generateVCard,
  getNestedValue,
  processDirectory,
} from "../src/extract-contacts";

describe("extractEmailFromString", () => {
  it("parses name and email in brackets", () => {
    const result = extractEmailFromString('Jane Doe <JANE.DOE@Example.com>');
    expect(result).toEqual({ name: "Jane Doe", email: "jane.doe@example.com" });
  });

  it("parses quoted name", () => {
    const result = extractEmailFromString('"Doe, John" <john@example.com>');
    expect(result).toEqual({ name: "Doe, John", email: "john@example.com" });
  });

  it("parses bare email", () => {
    const result = extractEmailFromString("user@example.com");
    expect(result).toEqual({ name: "", email: "user@example.com" });
  });

  it("returns null when no email exists", () => {
    expect(extractEmailFromString("not an email")).toBeNull();
  });
});

describe("extractEmailsFromValue", () => {
  it("splits comma/semicolon separated strings", () => {
    const result = extractEmailsFromValue("a@b.com, c@d.com; e@f.com");
    expect(result.map((item) => item.email)).toEqual(["a@b.com", "c@d.com", "e@f.com"]);
  });

  it("handles nested arrays", () => {
    const result = extractEmailsFromValue(["one@ex.com", ["two@ex.com"]]);
    expect(result.map((item) => item.email)).toEqual(["one@ex.com", "two@ex.com"]);
  });
});

describe("getNestedValue", () => {
  it("returns nested values", () => {
    const obj = { a: { b: { c: 123 } } };
    expect(getNestedValue(obj, ["a", "b", "c"])).toBe(123);
  });

  it("returns undefined for missing paths", () => {
    const obj = { a: { b: { c: 123 } } };
    expect(getNestedValue(obj, ["a", "x", "c"])).toBeUndefined();
  });
});

describe("extractContactsFromParsed", () => {
  it("extracts addresses from structured fields", () => {
    const contacts = new Map();
    const parsed = {
      OPFMessageCopyToAddresses: {
        $: {
          OPFContactEmailAddressAddress: "To@Example.com",
          OPFContactEmailAddressName: "To Name",
        },
      },
      OPFMessageCopyFromAddresses: {
        $: {
          OPFContactEmailAddressAddress: "From@Example.com",
        },
      },
    };

    extractContactsFromParsed(parsed, contacts, false);
    expect(contacts.get("to@example.com")).toMatchObject({
      email: "to@example.com",
      name: "To Name",
      source: "to",
      count: 1,
    });
    expect(contacts.get("from@example.com")).toMatchObject({
      email: "from@example.com",
      source: "from",
      count: 1,
    });
  });

  it("extracts addresses from preview text when enabled", () => {
    const contacts = new Map();
    const parsed = {
      OPFMessageCopyPreview: {
        _: "From: Preview Name &lt;preview@example.com&gt; To: Dest &lt;dest@example.com&gt;",
      },
    };

    extractContactsFromParsed(parsed, contacts, true);
    expect(contacts.get("preview@example.com")).toMatchObject({
      email: "preview@example.com",
      name: "Preview Name",
      source: "from",
    });
    expect(contacts.get("dest@example.com")).toMatchObject({
      email: "dest@example.com",
      name: "Dest",
      source: "to",
    });
  });
});

describe("generateCSV", () => {
  it("escapes CSV fields", () => {
    const csv = generateCSV([
      { email: "user@example.com", name: 'Doe, "Jr"', source: "to", count: 2 },
    ]);

    const lines = csv.split("\n");
    expect(lines[0]).toBe("Email,Name,Source,Message Count");
    expect(lines[1]).toBe('user@example.com,"Doe, ""Jr""",to,2');
  });
});

describe("generateVCard", () => {
  it("formats vCards with name and email", () => {
    const vcard = generateVCard([
      { email: "user@example.com", name: "Jane Doe", source: "to", count: 2 },
    ]);

    expect(vcard).toContain("BEGIN:VCARD");
    expect(vcard).toContain("FN:Jane Doe");
    expect(vcard).toContain("N:Doe;Jane;;;");
    expect(vcard).toContain("EMAIL;TYPE=INTERNET:user@example.com");
    expect(vcard).toContain("END:VCARD");
  });
});

describe("integration", () => {
  it("processes extracted directories", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "olm-test-"));
    try {
      const xmlContent = `
        <root>
          <OPFMessageCopyToAddresses>
            <emailAddress OPFContactEmailAddressAddress="to@example.com" OPFContactEmailAddressName="To Name" />
          </OPFMessageCopyToAddresses>
        </root>
      `;
      await writeFile(join(tempDir, "message.xml"), xmlContent, "utf-8");

      const contacts = new Map();
      const fileCount = await processDirectory(tempDir, contacts, false);

      expect(fileCount).toBe(1);
      expect(contacts.get("to@example.com")).toMatchObject({
        email: "to@example.com",
        name: "To Name",
        source: "to",
        count: 1,
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("processes .olm archives", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "olm-zip-test-"));
    const olmPath = join(tempDir, "fixture.olm");
    const zip = new AdmZip();

    const xmlContent = `
      <root>
        <OPFMessageCopyFromAddresses>
          <emailAddress OPFContactEmailAddressAddress="from@example.com" />
        </OPFMessageCopyFromAddresses>
      </root>
    `;

    zip.addFile("message.xml", Buffer.from(xmlContent));
    zip.writeZip(olmPath);

    let extractedDir: string | null = null;
    try {
      extractedDir = await extractOlmFile(olmPath);
      const contacts = new Map();
      const fileCount = await processDirectory(extractedDir, contacts, false);

      expect(fileCount).toBe(1);
      expect(contacts.get("from@example.com")).toMatchObject({
        email: "from@example.com",
        source: "from",
        count: 1,
      });
    } finally {
      if (extractedDir) {
        await rm(extractedDir, { recursive: true, force: true });
      }
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
