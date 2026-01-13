import JSZip from 'jszip';

interface Contact {
  email: string;
  name: string;
  source: 'from' | 'to' | 'cc' | 'bcc';
  count: number;
}

type ContactMap = Map<string, Contact>;

function decodeXmlBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2) {
    const bom = (bytes[0] << 8) | bytes[1];
    if (bom === 0xfffe) {
      return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    }
    if (bom === 0xfeff) {
      return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    }
  }

  return new TextDecoder('utf-8').decode(bytes);
}

function addContact(contacts: ContactMap, email: string, name: string, source: Contact['source']): void {
  const existing = contacts.get(email);
  if (existing) {
    existing.count++;
    if (name && !existing.name) {
      existing.name = name;
    }
    return;
  }

  contacts.set(email, { email, name, source, count: 1 });
}

// Extract emails from preview text (for sent messages)
function extractEmailsFromPreview(previewText: string): { email: string; name: string; source: Contact['source'] }[] {
  const results: { email: string; name: string; source: Contact['source'] }[] = [];

  // Decode HTML entities (&lt; -> <, &gt; -> >)
  const decodedText = previewText
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Match patterns like: "From: Name <email@example.com>" or "To: Name <email@example.com>"
  const headerRegex = /(From|To|Cc):\s*(.+?)\s*<([^>]+)>/gim;

  let match;
  while ((match = headerRegex.exec(decodedText)) !== null) {
    const headerType = match[1].toLowerCase();
    const name = match[2].trim();
    const email = match[3].trim();

    if (email.includes('@')) {
      let source: Contact['source'];
      if (headerType === 'from') source = 'from';
      else if (headerType === 'to') source = 'to';
      else if (headerType === 'cc') source = 'cc';
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

// Extract contacts from XML document
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractContactsFromXmlText(
  xmlContent: string,
  contacts: ContactMap,
  extractFromPreview: boolean = false
): void {
  const emailFields: { key: string; source: Contact['source'] }[] = [
    { key: 'OPFMessageCopyFromAddresses', source: 'from' },
    { key: 'OPFMessageCopyToAddresses', source: 'to' },
    { key: 'OPFMessageCopyCCAddresses', source: 'cc' },
    { key: 'OPFMessageCopyBCCAddresses', source: 'bcc' },
    { key: 'OPFMessageCopyReplyToAddresses', source: 'from' },
  ];

  for (const { key, source } of emailFields) {
    const containerRegex = new RegExp(`<${key}\\b[^>]*>([\\s\\S]*?)</${key}>`, 'gi');
    let containerMatch: RegExpExecArray | null;
    while ((containerMatch = containerRegex.exec(xmlContent)) !== null) {
      const containerBody = containerMatch[1];
      const addressRegex = /<emailAddress\b[^>]*>/gi;
      let addressMatch: RegExpExecArray | null;
      while ((addressMatch = addressRegex.exec(containerBody)) !== null) {
        const tag = addressMatch[0];
        const emailMatch = tag.match(/OPFContactEmailAddressAddress=(["'])(.*?)\1/i);
        if (!emailMatch || !emailMatch[2].includes('@')) continue;
        const nameMatch = tag.match(/OPFContactEmailAddressName=(["'])(.*?)\1/i);
        const email = decodeXmlEntities(emailMatch[2]).toLowerCase();
        const name = nameMatch ? decodeXmlEntities(nameMatch[2]) : '';
        addContact(contacts, email, name, source);
      }
    }
  }

  if (extractFromPreview) {
    const previewRegex = /<OPFMessageCopyPreview\b[^>]*>([\s\S]*?)<\/OPFMessageCopyPreview>/gi;
    let previewMatch: RegExpExecArray | null;
    while ((previewMatch = previewRegex.exec(xmlContent)) !== null) {
      const previewText = decodeXmlEntities(previewMatch[1].replace(/<[^>]+>/g, ''));
      if (!previewText) continue;
      const previewEmails = extractEmailsFromPreview(previewText);
      for (const { email, name, source } of previewEmails) {
        addContact(contacts, email.toLowerCase(), name, source);
      }
    }
  }
}

// Generate CSV content
function escapeCSV(str: string): string {
  if (!str) return '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCSV(contacts: Contact[]): string {
  const header = 'Email,Name,Source,Message Count';
  const rows = contacts.map(
    (c) => `${escapeCSV(c.email)},${escapeCSV(c.name)},${c.source},${c.count}`
  );
  return [header, ...rows].join('\n');
}

// Generate vCard content
function generateVCard(contacts: Contact[]): string {
  return contacts
    .map((c) => {
      const nameParts = c.name ? c.name.split(' ') : [];
      const lastName = nameParts.length > 1 ? nameParts.pop() : '';
      const firstName = nameParts.join(' ');

      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        c.name ? `FN:${c.name}` : `FN:${c.email}`,
        c.name ? `N:${lastName};${firstName};;;` : `N:;;;;`,
        `EMAIL;TYPE=INTERNET:${c.email}`,
        `NOTE:Source: ${c.source}, Messages: ${c.count}`,
        'END:VCARD',
      ].join('\r\n');
    })
    .join('\r\n');
}

// Main worker message handler
self.onmessage = async (e: MessageEvent) => {
  const { file, extractFromPreview } = e.data;

  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Extract .olm (ZIP) file using JSZip
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Get all XML file names
    const xmlFiles = Object.keys(zip.files).filter(
      (fileName) => fileName.endsWith('.xml') && !zip.files[fileName].dir
    );
    const totalFiles = xmlFiles.length;

    console.log(`Found ${totalFiles} XML files in archive`);

    if (totalFiles === 0) {
      throw new Error('No XML files found in .olm archive');
    }

    const contacts: ContactMap = new Map();
    let processedFiles = 0;
    let parseErrors = 0;

    // Process each XML file and debug first one
    for (const fileName of xmlFiles) {
      try {
        const xmlBytes = await zip.files[fileName].async('uint8array');
        const xmlContent = decodeXmlBytes(xmlBytes);

        // Debug FIRST file only - send structure to UI
        if (processedFiles === 0) {
          self.postMessage({
            type: 'debug',
            message: `First file: ${fileName}`,
            xmlPreview: xmlContent.substring(0, 500),
          });
        }

        extractContactsFromXmlText(xmlContent, contacts, extractFromPreview);
        processedFiles++;

        // Send progress update every 100 files or at the end
        if (processedFiles % 100 === 0 || processedFiles === totalFiles) {
          self.postMessage({
            type: 'progress',
            progress: Math.round((processedFiles / totalFiles) * 100),
            processedFiles,
            totalFiles,
            contactsFound: contacts.size,
          });
        }
      } catch (err) {
        if (parseErrors < 3) {
          console.warn(`XML parse failed for ${fileName}`, err);
        }
        parseErrors++;
        // Skip unparseable files
        processedFiles++;
      }
    }

    // Sort contacts by count
    const sortedContacts = Array.from(contacts.values()).sort((a, b) => b.count - a.count);

    console.log(`Total contacts found: ${contacts.size}`);
    console.log(`Processed ${processedFiles} files`);

    // Generate CSV and vCard
    const csvAll = generateCSV(sortedContacts);
    const csvFrequent = generateCSV(sortedContacts.filter((c) => c.count >= 3));
    const vcardData = generateVCard(sortedContacts);

    // Send final results
    self.postMessage({
      type: 'complete',
      result: {
        totalContacts: contacts.size,
        frequentContacts: sortedContacts.filter((c) => c.count >= 3).length,
        csvData: csvAll,
        csvFrequentData: csvFrequent,
        vcardData: vcardData,
        topContacts: sortedContacts.slice(0, 10).map((c) => ({
          email: c.email,
          name: c.name,
          count: c.count,
        })),
      },
    });
  } catch (error: any) {
    self.postMessage({
      type: 'error',
      error: error.message || 'Unknown error occurred',
    });
  }
};
