import { useEffect, useRef, useState } from 'react';
import { Upload, Download, FileText, Users, Mail, Check, Info, ShieldCheck, BookOpen, Play } from 'lucide-react';
import legacyOutlookMenu from './assets/howto/legacy-outlook-menu.png';
import outlookSyncStatus from './assets/howto/outlook-sync-status.png';
import outlookToolsExport from './assets/howto/outlook-tools-export.png';

type AppState = 'idle' | 'processing' | 'complete';

interface ProcessingResult {
  totalContacts: number;
  frequentContacts: number;
  csvData: string;
  csvFrequentData: string;
  vcardData: string;
  topContacts: Array<{ email: string; name: string; count: number }>;
}

function App() {
  const currentPath = window.location.pathname;
  const isItalianPath = currentPath === '/it' || currentPath.startsWith('/it/');
  const normalizedPath = isItalianPath ? currentPath.replace(/^\/it/, '') || '/' : currentPath;
  const isPrivacyPage = normalizedPath === '/privacy';
  const isLegacyGuidePage = normalizedPath === '/legacy-outlook';
  const isRootPage = normalizedPath === '/' || normalizedPath === '';
  const isNotFoundPage = !isRootPage && !isPrivacyPage && !isLegacyGuidePage;
  const t = (en: string, it: string) => (isItalianPath ? it : en);
  const withLocale = (path: string) => (isItalianPath ? `/it${path === '/' ? '' : path}` : path);
  const [state, setState] = useState<AppState>('idle');
  const [extractFromPreview, setExtractFromPreview] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [obfuscateResults, setObfuscateResults] = useState(false);
  const [showDemoMedia, setShowDemoMedia] = useState(true);
  const [demoLoaded, setDemoLoaded] = useState(false);
  const [demoPlaying, setDemoPlaying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const baseTitle = isItalianPath
      ? 'Outlook Contacts Exporter - OLM a CSV o vCard'
      : 'Outlook Contacts Exporter - OLM to CSV or vCard';
    const privacyTitle = isItalianPath ? 'Informativa sulla privacy' : 'Privacy Policy';
    const legacyTitle = isItalianPath ? 'Guida export Legacy Outlook' : 'Legacy Outlook Export Guide';
    const notFoundTitle = isItalianPath ? 'Pagina non trovata' : 'Page Not Found';
    const description = isItalianPath
      ? 'Estrai contatti da backup .olm di Outlook per Mac direttamente nel browser. Esporta CSV o vCard con elaborazione locale e privata.'
      : 'Extract contacts from Outlook for Mac .olm backups directly in your browser. Export CSV or vCard with fully local, private processing.';

    const pageTitle = isPrivacyPage
      ? `${privacyTitle} - ${baseTitle}`
      : isLegacyGuidePage
        ? `${legacyTitle} - ${baseTitle}`
        : isNotFoundPage
          ? `${notFoundTitle} - ${baseTitle}`
          : baseTitle;
    document.title = pageTitle;

    const canonicalPath = isPrivacyPage ? '/privacy' : isLegacyGuidePage ? '/legacy-outlook' : '/';
    const localePrefix = isItalianPath ? '/it' : '';
    const canonicalUrl = `https://outlook-contacts.echovalue.dev${localePrefix}${canonicalPath === '/' ? '' : canonicalPath}`;

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      canonical.setAttribute('href', canonicalUrl);
    }
    const robots = document.querySelector('meta[name="robots"]');
    if (robots) {
      robots.setAttribute('content', isNotFoundPage ? 'noindex,follow' : 'index,follow');
    }
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', description);
    }
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      ogTitle.setAttribute('content', pageTitle);
    }
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) {
      ogDescription.setAttribute('content', description);
    }
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) {
      ogUrl.setAttribute('content', canonicalUrl);
    }
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) {
      twitterTitle.setAttribute('content', pageTitle);
    }
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    if (twitterDescription) {
      twitterDescription.setAttribute('content', description);
    }
    const twitterUrl = document.querySelector('meta[name="twitter:url"]');
    if (twitterUrl) {
      twitterUrl.setAttribute('content', canonicalUrl);
    }
    document.documentElement.lang = isItalianPath ? 'it' : 'en';
  }, [isPrivacyPage, isLegacyGuidePage, isNotFoundPage, isItalianPath]);

  const obfuscateName = (name: string) => {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    return parts
      .map((part) => {
        if (part.length <= 1) return '*';
        return `${part[0]}${'*'.repeat(Math.max(1, part.length - 1))}`;
      })
      .join(' ');
  };

  const obfuscateEmail = (email: string) => {
    if (!email || !email.includes('@')) return email;
    const [local, domain] = email.split('@');
    const localMasked =
      local.length <= 2 ? `${local[0] ?? ''}*` : `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}`;
    const domainParts = domain.split('.');
    if (domainParts.length < 2) return `${localMasked}@${domain}`;
    const tld = domainParts.pop() ?? '';
    const host = domainParts.join('.');
    const hostMasked = host.length <= 1 ? '*' : `${host[0]}${'*'.repeat(Math.max(1, host.length - 1))}`;
    return `${localMasked}@${hostMasked}.${tld}`;
  };

  const displayName = (name: string) => (obfuscateResults ? obfuscateName(name) : name);
  const displayEmail = (email: string) => (obfuscateResults ? obfuscateEmail(email) : email);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.olm')) {
      alert(t('Please upload a .olm file', 'Carica un file .olm'));
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
      const { type, progress: newProgress, result: workerResult, error } = e.data;

      if (type === 'progress') {
        setProgress(newProgress);
      } else if (type === 'complete') {
        setProgress(100);
        setResult(workerResult);
        setTimeout(() => {
          setState('complete');
        }, 300);
        worker.terminate();
      } else if (type === 'error') {
        alert(`${t('Error', 'Errore')}: ${error}`);
        setState('idle');
        setProgress(0);
        worker.terminate();
      }
    };

    worker.onerror = (error) => {
      console.error('Worker error:', error);
      alert(t('Error processing file. Please try again.', "Errore durante l'elaborazione del file. Riprova."));
      setState('idle');
      setProgress(0);
      worker.terminate();
    };

    // Send file to worker
    worker.postMessage({ file, extractFromPreview });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setState('idle');
    setProgress(0);
    setResult(null);
    setFileName('');
  };

  if (isPrivacyPage) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 dot-pattern opacity-40" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-200 rounded-full filter blur-[128px] opacity-30 animate-float" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-coral-400 rounded-full filter blur-[128px] opacity-20" style={{ animationDelay: '3s' }} />

        <div className="relative z-10 container mx-auto px-6 py-16 max-w-4xl">
          <header className="text-center mb-12 animate-slide-up">
            <div className="inline-flex items-center gap-3 mb-6">
              <div className="p-3 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl shadow-lg shadow-primary-500/30">
                <ShieldCheck className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-5xl font-bold bg-gradient-to-br from-slate-900 via-slate-800 to-slate-600 bg-clip-text text-transparent">
                {t('Privacy Policy', 'Informativa sulla privacy')}
              </h1>
            </div>
            <p className="text-lg text-slate-600">
              {t('We built this tool to keep your data on your device.', 'Abbiamo creato questo strumento per tenere i tuoi dati sul tuo dispositivo.')}
            </p>
          </header>

          <section className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-xl space-y-6 text-slate-600">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">{t('Local Processing Only', 'Elaborazione solo locale')}</h2>
              <p>
                {t(
                  'Your .olm file is processed entirely in your browser. No files are uploaded, stored, or transmitted to any server.',
                  'Il tuo file .olm viene elaborato interamente nel browser. Nessun file viene caricato, salvato o trasmesso a server.'
                )}
              </p>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">{t('No Accounts or Tracking', 'Nessun account o tracciamento')}</h2>
              <p>
                {t('This app does not require an account and does not use analytics or trackers.', "Questa app non richiede un account e non usa analytics o tracker.")}
              </p>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">{t('Data Exports', 'Esportazione dati')}</h2>
              <p>
                {t('CSV and vCard files are generated locally and downloaded directly to your device.', 'I file CSV e vCard vengono generati localmente e scaricati direttamente sul tuo dispositivo.')}
              </p>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">{t('Contact', 'Contatti')}</h2>
              <p>
                {t('Questions? Open an issue on GitHub and we will respond.', 'Domande? Apri un issue su GitHub e risponderemo.')}
              </p>
            </div>
          </section>

          <footer className="mt-12 text-center text-sm text-slate-500">
            <a href={withLocale('/')} className="text-primary-600 hover:text-primary-700 transition-colors">
              {t('Back to the app', "Torna all'app")}
            </a>
          </footer>
        </div>
      </div>
    );
  }

  if (isNotFoundPage) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 dot-pattern opacity-40" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-200 rounded-full filter blur-[128px] opacity-30 animate-float" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-coral-400 rounded-full filter blur-[128px] opacity-20" style={{ animationDelay: '3s' }} />

        <div className="relative z-10 container mx-auto px-6 py-20 max-w-3xl text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl shadow-lg shadow-primary-500/30 mb-6">
            <Mail className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-br from-slate-900 via-slate-800 to-slate-600 bg-clip-text text-transparent mb-4">
            {t('Page not found', 'Pagina non trovata')}
          </h1>
          <p className="text-lg text-slate-600 mb-8">
            {t(
              'The page you are looking for does not exist. Head back to the app and upload a .olm file.',
              "La pagina che cerchi non esiste. Torna all'app e carica un file .olm."
            )}
          </p>
          <a
            href={withLocale('/')}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-xl shadow-lg shadow-primary-500/30 hover:shadow-xl hover:shadow-primary-500/40 transition-all duration-300"
          >
            {t('Back to the app', "Torna all'app")}
          </a>
        </div>
      </div>
    );
  }

  if (isLegacyGuidePage) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 dot-pattern opacity-40" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-200 rounded-full filter blur-[128px] opacity-30 animate-float" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-coral-400 rounded-full filter blur-[128px] opacity-20" style={{ animationDelay: '3s' }} />

        <div className="relative z-10 container mx-auto px-6 py-16 max-w-5xl">
          <a
            href={withLocale('/')}
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors"
          >
            {t('Back to home', 'Torna alla home')}
          </a>

          <section className="mt-8 bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-xl">
            <h3 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2">
              <span className="p-2 bg-slate-100 rounded-lg">
                <BookOpen className="w-5 h-5 text-slate-700" />
              </span>
              {t(
                'Step-by-step: Outlook mailbox export on macOS (Legacy Outlook)',
                'Passo per passo: esportazione della casella Outlook su macOS (Legacy Outlook)'
              )}
            </h3>
            <p className="text-sm text-slate-600">
              {t(
                'Using Legacy Outlook? If you already see the legacy interface, skip to step 2.',
                "Usi Legacy Outlook? Se vedi gia l'interfaccia legacy, passa al punto 2."
              )}
            </p>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {t(
                'This tool reads .olm exports from Outlook for Mac. Windows exports (.pst) are not supported yet.',
                'Questo strumento legge gli export .olm di Outlook per Mac. Gli export di Windows (.pst) non sono ancora supportati.'
              )}
            </div>

            <div className="mt-6 space-y-6 text-slate-600">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white">
                    1
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-slate-900">
                      {t('Switch from New Outlook to Legacy Outlook', 'Passa da New Outlook a Legacy Outlook')}
                    </h4>
                    <ul className="list-disc pl-5">
                      <li>{t('In the macOS top menu, click Outlook.', 'Nel menu in alto di macOS, clicca Outlook.')}</li>
                      <li>{t('Select Legacy Outlook.', 'Seleziona Legacy Outlook.')}</li>
                      <li>{t('Confirm the switch (no data loss will occur).', 'Conferma il passaggio (nessuna perdita di dati).')}</li>
                      <li>{t('Outlook will restart in Legacy mode.', 'Outlook si riavviera in modalita Legacy.')}</li>
                    </ul>
                  </div>
                </div>
                <img
                  src={legacyOutlookMenu}
                  alt={t('Outlook menu showing Legacy Outlook option', "Menu di Outlook con l'opzione Legacy Outlook")}
                  className="mt-4 w-full rounded-xl border border-slate-200"
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white">
                    2
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-slate-900">
                      {t('Wait for full mailbox synchronization', 'Attendi la sincronizzazione completa della casella')}
                    </h4>
                    <p>
                      {t(
                        'Keep Outlook open for 30-60 minutes (or longer for large mailboxes). The time depends on mailbox size, email history, and internet speed.',
                        'Tieni Outlook aperto per 30-60 minuti (o piu a lungo per caselle grandi). Il tempo dipende dalla dimensione della casella, dallo storico delle email e dalla velocita di Internet.'
                      )}
                    </p>
                    <div>
                      <p className="font-semibold text-slate-800">
                        {t('How to verify synchronization', 'Come verificare la sincronizzazione')}
                      </p>
                      <ul className="list-disc pl-5">
                        <li>
                          {t(
                            'In the bottom sidebar, Outlook should display "All folders are up to date".',
                            'Nella barra in basso, Outlook dovrebbe mostrare "All folders are up to date".'
                          )}
                        </li>
                        <li>
                          {t(
                            'Open Inbox or Sent Items, sort oldest to newest, and scroll to confirm older emails.',
                            'Apri Posta in arrivo o Posta inviata, ordina dal piu vecchio al piu recente e scorri per vedere le email piu vecchie.'
                          )}
                        </li>
                      </ul>
                      <p className="mt-2 text-sm text-slate-500">
                        {t('Do not proceed until synchronization is complete.', 'Non procedere finche la sincronizzazione non e completa.')}
                      </p>
                    </div>
                  </div>
                </div>
                <img
                  src={outlookSyncStatus}
                  alt={t(
                    'Outlook status bar showing All folders are up to date',
                    'Barra di stato di Outlook con "All folders are up to date"'
                  )}
                  className="mt-4 w-full rounded-xl border border-slate-200"
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white">
                    3
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-slate-900">{t('Export the mailbox', 'Esporta la casella')}</h4>
                    <ol className="list-decimal pl-5">
                      <li>{t('In the left sidebar, click your account mailbox.', 'Nella barra laterale sinistra, fai clic sulla tua casella.')}</li>
                      <li>{t('In the menu bar, click Tools.', 'Nella barra dei menu, clicca Strumenti.')}</li>
                      <li>{t('Select Export.', 'Seleziona Esporta.')}</li>
                      <li>{t('Choose the items to export.', 'Scegli gli elementi da esportare.')}</li>
                      <li>{t('Click Continue.', 'Clicca Continua.')}</li>
                      <li>{t('Choose a destination folder for the export.', "Scegli una cartella di destinazione per l'esportazione.")}</li>
                    </ol>
                    <p>
                      {t('Outlook will create an archive file in .olm format.', 'Outlook creera un archivio in formato .olm.')}
                    </p>
                  </div>
                </div>
                <img
                  src={outlookToolsExport}
                  alt={t('Outlook Tools menu showing Export option', 'Menu Strumenti di Outlook con opzione Esporta')}
                  className="mt-4 w-full rounded-xl border border-slate-200"
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white">
                    4
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-slate-900">{t('Export file ready', 'File di esportazione pronto')}</h4>
                    <p>
                      {t(
                        'Your Outlook for Mac archive (.olm) file is now ready and can be used for:',
                        'Il file archivio Outlook per Mac (.olm) e ora pronto e puo essere usato per:'
                      )}
                    </p>
                    <ul className="list-disc pl-5">
                      <li>{t('Email backup', 'Backup email')}</li>
                      <li>{t('Contact extraction', 'Estrazione contatti')}</li>
                      <li>{t('Migration to another system', 'Migrazione verso un altro sistema')}</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white">
                    5
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-slate-900">
                      {t('(Optional) Import the mailbox into Outlook', '(Opzionale) Importa la casella in Outlook')}
                    </h4>
                    <ol className="list-decimal pl-5">
                      <li>{t('Open Outlook (Legacy).', 'Apri Outlook (Legacy).')}</li>
                      <li>{t('In the menu bar, click Tools.', 'Nella barra dei menu, clicca Strumenti.')}</li>
                      <li>{t('Select Import.', 'Seleziona Importa.')}</li>
                      <li>{t('Choose the previously exported .olm file.', 'Scegli il file .olm esportato in precedenza.')}</li>
                      <li>{t('Complete the import.', "Completa l'importazione.")}</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-center">
              <a
                href={withLocale('/')}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
              >
                {t('Back to home', 'Torna alla home')}
              </a>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 dot-pattern opacity-40" />

      {/* Gradient Orbs */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-200 rounded-full filter blur-[128px] opacity-30 animate-float" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-coral-400 rounded-full filter blur-[128px] opacity-20" style={{ animationDelay: '3s' }} />

      <div className="relative z-10 container mx-auto px-6 py-16 max-w-5xl">
        {/* Header */}
        <header className="text-center mb-10 sm:mb-12 animate-slide-up">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="p-3 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl shadow-lg shadow-primary-500/30">
              <Mail className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-br from-slate-900 via-slate-800 to-slate-600 bg-clip-text text-transparent">
              {t('Move your Outlook contacts out of .olm in seconds', 'Sposta i contatti di Outlook fuori dal .olm in pochi secondi')}
            </h1>
          </div>

          <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            {t('OLM to CSV / vCard converter for Outlook for Mac.', 'Convertitore da OLM a CSV / vCard per Outlook per Mac.')}
            <span className="block">
              {t('100% local, private, and runs entirely in your browser.', '100% locale, privato e funziona interamente nel tuo browser.')}
            </span>
            <span className="mt-4 text-sm text-slate-500 font-medium inline-flex items-center gap-2 justify-center">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              {t('No uploads. No tracking. Just local processing.', 'Nessun upload. Nessun tracciamento. Solo elaborazione locale.')}
            </span>
          </p>

          <div className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm text-slate-600">
            {[
              { label: t('Runs entirely in your browser', 'Funziona interamente nel tuo browser') },
              { label: t('Your file never leaves your device', 'Il file non lascia mai il tuo dispositivo') },
              { label: t('Open-source on GitHub', 'Open-source su GitHub'), href: 'https://github.com/njoylab/outlook-contacts-exporter' },
              { label: t('No accounts or tracking', 'Nessun account o tracciamento'), className: 'hidden sm:flex' },
              { label: t('Works offline after load', 'Funziona offline dopo il caricamento'), className: 'hidden sm:flex' },
            ].map((item) => (
              <div
                key={item.label}
                className={`items-center justify-center gap-2 bg-white/70 px-3 py-2 rounded-full border border-slate-200 ${item.className ?? 'flex'}`}
              >
                <Check className="w-4 h-4 text-emerald-600" />
                {item.href ? (
                  <a
                    href={item.href}
                    className="hover:text-slate-900 transition-colors"
                    rel="noreferrer"
                  >
                    {item.label}
                  </a>
                ) : (
                  <span>{item.label}</span>
                )}
              </div>
            ))}
          </div>

        <div className="mt-5 sm:mt-6 inline-flex flex-wrap items-center justify-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span className="px-3 py-2 rounded-full bg-slate-100">{t('Upload .olm', 'Carica .olm')}</span>
            <span className="text-slate-400">→</span>
            <span className="px-3 py-2 rounded-full bg-slate-100">{t('Parse locally', 'Analizza localmente')}</span>
            <span className="text-slate-400">→</span>
            <span className="px-3 py-2 rounded-full bg-slate-100">{t('Download CSV / vCard', 'Scarica CSV / vCard')}</span>
          </div>
        </header>

        {/* Main Content */}
        <div className="space-y-8">
          {/* Upload Section */}
          {state === 'idle' && (
            <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
              <div className="text-center text-sm font-semibold uppercase tracking-wide text-primary-700 mb-4">
                {t('Drop your .olm file to convert', 'Trascina il tuo file .olm per convertirlo')}
              </div>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={(event) => {
                  if (event.target === event.currentTarget) {
                    fileInputRef.current?.click();
                  }
                }}
                className={`
                  relative bg-white/80 backdrop-blur-sm rounded-3xl p-12
                  border-3 border-dashed transition-all duration-300 shadow-lg
                  ${isDragging
                    ? 'border-primary-500 bg-primary-50/50 scale-[1.02]'
                    : 'border-slate-300 hover:border-slate-400'
                  }
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".olm"
                  onChange={handleFileInput}
                  className="sr-only"
                  id="file-upload"
                />

                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-primary-100 to-primary-200 rounded-2xl mb-6">
                    <Upload className="w-10 h-10 text-primary-600" />
                  </div>

                  <h3 className="text-2xl font-bold text-slate-900 mb-3">
                    {t('Drag & drop your .olm file', 'Trascina qui il tuo file .olm')}
                  </h3>
                  <p className="text-slate-600 mb-6">
                    {t('or', 'oppure')}{' '}
                    <label
                      htmlFor="file-upload"
                      className="text-primary-600 font-semibold cursor-pointer hover:text-primary-700 transition-colors"
                    >
                      {t('browse files', 'sfoglia i file')}
                    </label>
                  </p>
                  <p className="text-sm text-slate-500 mb-6">
                    {t('Having issues? Please', 'Hai problemi?')}{' '}
                    <a
                      href="https://github.com/njoylab/outlook-contacts-exporter/issues"
                      className="text-primary-600 hover:text-primary-700 transition-colors"
                    >
                      {t('open an issue on GitHub', 'apri un issue su GitHub')}
                    </a>
                    .
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {t(
                      'Local-only: the file is processed on your device and never uploaded.',
                      'Solo in locale: il file viene elaborato sul tuo dispositivo e non viene mai caricato.'
                    )}
                  </p>

                  <div className="flex flex-col md:flex-row items-center md:items-start gap-6 justify-center pt-6 border-t border-slate-200">
                    <div
                      className="flex items-start gap-3 text-left max-w-sm"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        id="scan-sent"
                        type="checkbox"
                        checked={extractFromPreview}
                        onChange={(e) => setExtractFromPreview(e.target.checked)}
                        className="w-5 h-5 text-primary-600 border-slate-300 rounded focus:ring-primary-500 focus:ring-offset-2 cursor-pointer mt-1"
                      />
                      <div>
                        <label
                          htmlFor="scan-sent"
                          className="text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors cursor-pointer inline-flex items-center gap-2"
                        >
                          {t('Also scan Sent Mail (optional)', 'Analizza anche Posta inviata (opzionale)')}
                          <span className="group/tooltip relative inline-flex">
                            <Info className="w-4 h-4 text-slate-400 hover:text-slate-600 transition-colors" />
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl">
                              {t(
                                'Find more contacts by extracting recipients from sent messages',
                                'Trova piu contatti estraendo i destinatari dai messaggi inviati'
                              )}
                              <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900" />
                            </span>
                          </span>
                        </label>
                        <p className="text-xs text-slate-500 mt-1">
                          {t(
                            'This scans sent emails to find additional recipients. Still local-only.',
                            'Questo analizza le email inviate per trovare destinatari aggiuntivi. Sempre solo in locale.'
                          )}
                        </p>
                      </div>
                    </div>

                    <div
                      className="flex items-start gap-3 text-left"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        id="obfuscate-results"
                        type="checkbox"
                        checked={obfuscateResults}
                        onChange={(e) => setObfuscateResults(e.target.checked)}
                        className="w-5 h-5 text-primary-600 border-slate-300 rounded focus:ring-primary-500 focus:ring-offset-2 cursor-pointer mt-1"
                      />
                      <div>
                        <label
                          htmlFor="obfuscate-results"
                          className="text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
                        >
                          {t('Obfuscate results in UI', "Offusca i risultati nell'interfaccia")}
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <section className="mt-10 bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
                <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {showDemoMedia ? (
                    <video
                      className="w-full h-auto object-cover"
                      poster="/assets/demo-poster.jpg"
                      controls
                      muted
                      playsInline
                      preload="metadata"
                      onLoadedData={() => setDemoLoaded(true)}
                      onPlay={() => setDemoPlaying(true)}
                      onPause={() => setDemoPlaying(false)}
                      onEnded={() => setDemoPlaying(false)}
                      onError={() => {
                        setDemoLoaded(false);
                        setShowDemoMedia(false);
                      }}
                    >
                      <source src="/assets/demo.webm" type="video/webm" />
                      <source src="/assets/demo.mp4" type="video/mp4" />
                    </video>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center text-slate-500">
                      <div className="w-12 h-12 rounded-2xl bg-white shadow-md flex items-center justify-center">
                        <Upload className="w-6 h-6 text-primary-600" />
                      </div>
                      <p className="text-sm font-medium">
                        {t('Demo preview unavailable', 'Anteprima demo non disponibile')}
                      </p>
                      <p className="text-xs text-slate-400">
                        {t(
                          'The converter still works fully offline in your browser.',
                          'Il convertitore funziona comunque completamente offline nel tuo browser.'
                        )}
                      </p>
                    </div>
                  )}
                  {showDemoMedia && (
                    <div
                      className={`pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-100 via-white to-slate-100 opacity-60 transition-opacity duration-700 ${
                        demoLoaded ? 'opacity-0' : 'animate-pulse'
                      }`}
                    />
                  )}
                  {showDemoMedia && !demoPlaying && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-lg">
                        <Play className="w-4 h-4 text-primary-600" />
                        {t('Watch a 5s demo', 'Guarda una demo di 5s')}
                      </div>
                    </div>
                  )}
                </div>
                <p className="mt-4 text-sm text-slate-600 text-center">
                  {t(
                    'Drop your .olm, wait a few seconds, download your contacts.',
                    'Trascina il tuo .olm, attendi qualche secondo, scarica i tuoi contatti.'
                  )}
                </p>
              </section>
            </div>
          )}

          {/* Processing Section */}
          {state === 'processing' && (
            <div className="animate-fade-in">
              <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-12 shadow-xl">
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-2xl mb-4 animate-pulse">
                    <FileText className="w-8 h-8 text-primary-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">
                    {t('Processing', 'Elaborazione di')} {fileName}
                  </h3>
                  <p className="text-slate-600">
                    {t('Extracting contacts from your backup file...', 'Estrazione dei contatti dal file di backup...')}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span className="text-slate-600">{t('Progress', 'Progresso')}</span>
                    <span className="text-primary-600">{progress}%</span>
                  </div>

                  <div className="relative h-3 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    >
                      <div className="absolute inset-0 bg-white/20 animate-pulse" />
                    </div>
                  </div>
                </div>

                {extractFromPreview && (
                  <div className="mt-6 p-4 bg-primary-50 rounded-xl border border-primary-200">
                    <p className="text-sm text-primary-800 flex items-center gap-2">
                      <Check className="w-4 h-4" />
                      <span className="font-medium">
                        {t('Sent messages scanning enabled', 'Scansione dei messaggi inviati attiva')}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Results Section */}
          {state === 'complete' && result && (
            <div className="space-y-6 animate-slide-up">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-white to-primary-50/50 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-primary-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-primary-100 rounded-lg">
                      <Users className="w-5 h-5 text-primary-600" />
                    </div>
                    <span className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
                      {t('Total Contacts', 'Contatti totali')}
                    </span>
                  </div>
                  <p className="text-4xl font-bold text-slate-900">{result.totalContacts}</p>
                </div>

                <div className="bg-gradient-to-br from-white to-coral-50/50 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-coral-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-coral-100 rounded-lg">
                      <Mail className="w-5 h-5 text-coral-600" />
                    </div>
                    <span className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
                      {t('Frequent (3+)', 'Frequenti (3+)')}
                    </span>
                  </div>
                  <p className="text-4xl font-bold text-slate-900">{result.frequentContacts}</p>
                </div>

                <div className="bg-gradient-to-br from-white to-emerald-50/50 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-emerald-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-emerald-100 rounded-lg">
                      <Check className="w-5 h-5 text-emerald-600" />
                    </div>
                    <span className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
                      {t('Status', 'Stato')}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-600">{t('Complete', 'Completato')}</p>
                </div>
              </div>

              {/* Top Contacts */}
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-xl">
                <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <span className="p-2 bg-slate-100 rounded-lg">
                    <Users className="w-5 h-5 text-slate-700" />
                  </span>
                  {t('Top Contacts', 'Contatti principali')}
                </h3>
                <div className="space-y-3">
                  {result.topContacts.map((contact, index) => (
                    <div
                      key={contact.email}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center text-white font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">
                            {displayName(contact.name) || displayEmail(contact.email)}
                          </p>
                          <p className="text-sm text-slate-500">{displayEmail(contact.email)}</p>
                        </div>
                      </div>
                      <div className="px-4 py-2 bg-white rounded-lg shadow-sm">
                        <span className="text-sm font-bold text-slate-600">
                          {t(`${contact.count} messages`, `${contact.count} messaggi`)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Download Buttons */}
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-xl">
                <h3 className="text-xl font-bold text-slate-900 mb-6">{t('Download Results', 'Scarica i risultati')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={() => downloadFile(result.csvData, 'contacts.csv', 'text/csv')}
                    className="group flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold rounded-xl shadow-lg shadow-primary-500/30 hover:shadow-xl hover:shadow-primary-500/40 transition-all duration-300 hover:scale-[1.02]"
                  >
                    <Download className="w-5 h-5 group-hover:animate-bounce" />
                    <span>{t('All Contacts CSV', 'CSV tutti i contatti')}</span>
                  </button>

                  <button
                    onClick={() => downloadFile(result.csvFrequentData, 'contacts-frequent.csv', 'text/csv')}
                    className="group flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40 transition-all duration-300 hover:scale-[1.02]"
                  >
                    <Download className="w-5 h-5 group-hover:animate-bounce" />
                    <span>{t('Frequent CSV', 'CSV frequenti')}</span>
                  </button>

                  <button
                    onClick={() => downloadFile(result.vcardData, 'contacts.vcf', 'text/vcard')}
                    className="group flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-coral-500 to-coral-600 hover:from-coral-600 hover:to-coral-700 text-white font-semibold rounded-xl shadow-lg shadow-coral-500/30 hover:shadow-xl hover:shadow-coral-500/40 transition-all duration-300 hover:scale-[1.02]"
                  >
                    <Download className="w-5 h-5 group-hover:animate-bounce" />
                    <span>vCard</span>
                  </button>
                </div>

                <button
                  onClick={reset}
                  className="w-full mt-4 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-all duration-300"
                >
                  {t('Process Another File', 'Elabora un altro file')}
                </button>
              </div>
            </div>
          )}
        </div>

        <section className="mt-16 bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-xl">
          <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <span className="p-2 bg-slate-100 rounded-lg">
              <BookOpen className="w-5 h-5 text-slate-700" />
            </span>
            {t('Exporting an OLM file from Outlook (Mac)', 'Esportare un file OLM da Outlook (Mac)')}
          </h3>
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {t(
              'This tool reads .olm exports from Outlook for Mac. Windows exports (.pst) are not supported yet.',
              'Questo strumento legge gli export .olm di Outlook per Mac. Gli export di Windows (.pst) non sono ancora supportati.'
            )}
          </div>
          <ol className="space-y-2 text-slate-600">
            <li>{t('1. Open Outlook and select your mailbox in the sidebar.', '1. Apri Outlook e seleziona la tua casella nella barra laterale.')}</li>
            <li>{t('2. Go to File -> Export.', '2. Vai su File -> Esporta.')}</li>
            <li>{t('3. Choose "Outlook for Mac Data File (.olm)" and click Continue.', '3. Scegli "Outlook for Mac Data File (.olm)" e clicca Continua.')}</li>
            <li>{t('4. Select what to export (Mail/Contacts/Calendar) and click Continue.', '4. Seleziona cosa esportare (Posta/Contatti/Calendario) e clicca Continua.')}</li>
            <li>{t('5. Save the .olm file to your computer, then upload it here.', '5. Salva il file .olm sul computer, poi caricalo qui.')}</li>
          </ol>
          <p className="mt-4 text-sm text-slate-600">
            {t('Having trouble? Use Legacy Outlook.', 'Hai problemi? Usa Legacy Outlook.')}{' '}
            <a
              href={withLocale('/legacy-outlook')}
              className="font-semibold text-primary-600 hover:text-primary-700 transition-colors"
            >
              {t('View the Legacy Outlook export guide.', "Vedi la guida all'esportazione Legacy Outlook.")}
            </a>
          </p>
        </section>

        <section className="mt-16 bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-xl">
          <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <span className="p-2 bg-slate-100 rounded-lg">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
            </span>
            {t('Privacy & Security', 'Privacy e sicurezza')}
          </h3>
          <div className="space-y-3 text-slate-600">
            <p>
              {t(
                'Your .olm file stays on your device. All parsing and exports run locally in the browser.',
                "Il file .olm resta sul tuo dispositivo. Tutta l'analisi e le esportazioni avvengono localmente nel browser."
              )}
            </p>
            <p>
              {t(
                'No uploads, no accounts, and no tracking. Just open the app, process, and download.',
                "Nessun upload, nessun account e nessun tracciamento. Apri l'app, elabora e scarica."
              )}
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-16 text-center text-sm text-slate-500">
          <p>
            {t(
              'Built with privacy in mind. All processing happens locally in your browser.',
              "Progettato con la privacy al centro. Tutta l'elaborazione avviene localmente nel tuo browser."
            )}
          </p>
          <p className="mt-2">
            <a
              href="https://github.com/njoylab/outlook-contacts-exporter"
              className="text-primary-600 hover:text-primary-700 transition-colors"
            >
              https://github.com/njoylab/outlook-contacts-exporter
            </a>
          </p>
          <p className="mt-2">
            <a href={withLocale('/privacy')} className="text-primary-600 hover:text-primary-700 transition-colors">
              {t('Privacy Policy', 'Informativa sulla privacy')}
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
