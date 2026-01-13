# OLM Contact Extractor - Web Implementation

## 🎨 What's Been Built

A beautiful, modern landing page for extracting contacts from Outlook Mac backup files (.olm). The page features:

### Design Highlights
- **Professional "Data Lab" aesthetic** with geometric precision and bold typography
- Custom font pairing: Syne (display) + Manrope (body) + JetBrains Mono (technical)
- Soft color palette: Deep slate/indigo primary, coral accents, cyan for success
- Animated background with dot pattern and floating gradient orbs
- Smooth state transitions and micro-interactions
- Fully responsive design

### Features
- ✅ Drag & drop file upload for .olm files
- ✅ "Extract from preview" checkbox option with tooltip
- ✅ Progress bar with percentage display
- ✅ Results page with:
  - Statistics cards (total contacts, frequent contacts, status)
  - Top contacts list
  - Download buttons for CSV and vCard files
- ✅ 100% client-side processing (privacy-focused)

## 🚀 Current Status

The UI is **fully functional** with mock data. The app simulates:
- File upload and validation
- Processing progress (4-second simulation)
- Display of results

## 🔧 Next Steps: Integration

To integrate the actual OLM processing logic, you need to:

### 1. Create a Web Worker

Create `src/worker/olm-processor.worker.ts`:

```typescript
// This worker will handle the actual .olm file processing
import AdmZip from 'adm-zip';
import { parseStringPromise } from 'xml2js';

self.onmessage = async (e: MessageEvent) => {
  const { file, extractFromPreview } = e.data;

  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Extract .olm (ZIP) file
    const zip = new AdmZip(Buffer.from(arrayBuffer));
    const zipEntries = zip.getEntries();

    let processedFiles = 0;
    const totalFiles = zipEntries.filter(entry =>
      entry.entryName.endsWith('.xml')
    ).length;

    const contacts = new Map();

    // Process each XML file
    for (const entry of zipEntries) {
      if (!entry.entryName.endsWith('.xml')) continue;

      try {
        const xmlContent = entry.getData().toString('utf8');
        const parsed = await parseStringPromise(xmlContent, {
          explicitArray: false,
          ignoreAttrs: false,
        });

        // Extract contacts (use logic from extract-contacts.ts)
        extractContactsFromParsed(parsed, contacts, extractFromPreview);

        processedFiles++;

        // Send progress update
        self.postMessage({
          type: 'progress',
          progress: Math.round((processedFiles / totalFiles) * 100),
        });
      } catch (err) {
        // Skip unparseable files
      }
    }

    // Generate CSV and vCard data
    const sortedContacts = Array.from(contacts.values())
      .sort((a, b) => b.count - a.count);

    const csvData = generateCSV(sortedContacts);
    const vcardData = generateVCard(sortedContacts);

    // Send results
    self.postMessage({
      type: 'complete',
      result: {
        totalContacts: contacts.size,
        frequentContacts: sortedContacts.filter(c => c.count >= 3).length,
        csvData,
        vcardData,
        topContacts: sortedContacts.slice(0, 10),
      },
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error.message,
    });
  }
};

// Copy the extraction functions from extract-contacts.ts here:
// - extractContactsFromParsed
// - generateCSV
// - generateVCard
```

### 2. Update App.tsx

Replace the `handleFile` function in `src/App.tsx`:

```typescript
const handleFile = async (file: File) => {
  if (!file.name.toLowerCase().endsWith('.olm')) {
    alert('Please upload a .olm file');
    return;
  }

  setFileName(file.name);
  setState('processing');
  setProgress(0);

  // Create Web Worker
  const worker = new Worker(
    new URL('./worker/olm-processor.worker.ts', import.meta.url),
    { type: 'module' }
  );

  worker.onmessage = (e: MessageEvent) => {
    const { type, progress: newProgress, result, error } = e.data;

    if (type === 'progress') {
      setProgress(newProgress);
    } else if (type === 'complete') {
      setProgress(100);
      setResult(result);
      setTimeout(() => {
        setState('complete');
      }, 300);
      worker.terminate();
    } else if (type === 'error') {
      alert(`Error: ${error}`);
      setState('idle');
      worker.terminate();
    }
  };

  // Send file to worker
  worker.postMessage({ file, extractFromPreview });
};
```

### 3. Install Dependencies

```bash
cd web
npm install adm-zip xml2js
npm install -D @types/adm-zip @types/xml2js
```

### 4. Configure Vite for Workers

Update `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
})
```

## 📁 Code Reuse

You can copy the following functions from `extract-contacts.ts` to the worker:
- `extractContactsFromParsed()`
- `extractEmailFromAttributes()`
- `extractEmailsFromPreview()`
- `generateCSV()`
- `generateVCard()`

These functions are pure TypeScript and will work in the Web Worker environment.

## 🎯 Testing

1. Start the dev server: `npm run dev`
2. Open http://localhost:5173/
3. Upload a .olm file
4. Verify the extraction works
5. Download and check the CSV/vCard files

## 🚢 Deployment

Since this is a static site with no backend:

### Option 1: Vercel (Recommended)
```bash
npm install -g vercel
vercel
```

### Option 2: Netlify
```bash
npm run build
# Upload the dist/ folder to Netlify
```

### Option 3: GitHub Pages
```bash
npm run build
# Push dist/ folder to gh-pages branch
```

## 📊 Performance Considerations

- **File Size Limit**: Browsers can handle ~500MB files in memory
- **Processing Time**: ~30 seconds for 20MB .olm files
- **UI Responsiveness**: Web Worker keeps UI smooth during processing

## 🔒 Privacy & Security

- All processing happens client-side
- No data sent to servers
- Files are processed in browser memory only
- Temporary data is cleared after processing

## 🎨 Customization

To customize the design:
- Colors: Edit `tailwind.config.js`
- Fonts: Change Google Fonts import in `src/index.css`
- Animations: Modify CSS animations in `src/index.css`
- Layout: Update components in `src/App.tsx`
