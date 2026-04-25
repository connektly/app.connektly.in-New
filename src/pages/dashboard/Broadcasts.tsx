import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  CornerDownLeft,
  Download,
  FileUp,
  Loader2,
  Megaphone,
  Search,
  Send,
  Users,
} from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import type { ConversationThread, MetaTemplate } from '../../lib/types';

const CAMPAIGNS_STORAGE_KEY = 'connektly-campaigns';
const LEGACY_BROADCASTS_STORAGE_KEY = 'connektly-broadcasts';

type AudienceSource = 'contacts' | 'csv';
type BroadcastTiming = 'now' | 'later';
type BroadcastStatus = 'Queued' | 'Scheduled';

interface AudienceImportRow {
  id: string;
  name: string;
  phone: string;
  labels: string[];
}

interface PastBroadcastRecord {
  id: string;
  campaignName: string;
  templateId: string;
  templateName: string;
  audienceCount: number;
  audienceSource: AudienceSource;
  timing: BroadcastTiming;
  scheduledFor: string | null;
  status: BroadcastStatus;
  createdAt: string;
}

interface BroadcastComposerState {
  campaignName: string;
  templateId: string;
  audienceSource: AudienceSource;
  timing: BroadcastTiming;
  scheduledDate: string;
  scheduledTime: string;
}

const SAMPLE_AUDIENCE_CSV = ['name,phone,labels', 'Aarav Sharma,+919876543210,vip|festival', 'Mia Johnson,+14155550123,newsletter'].join('\r\n');

function getInitialPastBroadcasts() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw =
      window.localStorage.getItem(CAMPAIGNS_STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_BROADCASTS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PastBroadcastRecord[]) : [];
  } catch {
    return [];
  }
}

function createEmptyComposerState(): BroadcastComposerState {
  return {
    campaignName: '',
    templateId: '',
    audienceSource: 'contacts',
    timing: 'now',
    scheduledDate: '',
    scheduledTime: '',
  };
}

function normalizeCsvHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCsvText(text: string) {
  const rows: string[][] = [];
  let currentCell = '';
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[index + 1] === '\n') {
        index += 1;
      }

      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.trim() !== ''));
}

function parseCsvRecords(text: string) {
  const rows = parseCsvText(text);

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map(normalizeCsvHeader);

  return rows.slice(1).map((row) =>
    headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = (row[index] || '').trim();
      return record;
    }, {}),
  );
}

function getRecordValue(record: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = record[normalizeCsvHeader(key)];

    if (value) {
      return value.trim();
    }
  }

  return '';
}

function parseLabels(value: string) {
  return value
    .split(/[|,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function triggerFileDownload(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getTemplateComponents(raw: Record<string, unknown> | null | undefined) {
  if (!raw) {
    return [];
  }

  const components = raw.components;

  return Array.isArray(components)
    ? components.filter(
        (component): component is Record<string, unknown> =>
          Boolean(component) && typeof component === 'object' && !Array.isArray(component),
      )
    : [];
}

function normalizeTemplateSnapshot(raw: Record<string, unknown> | null | undefined, fallbackName?: string | null) {
  const components = getTemplateComponents(raw);

  if (components.length === 0 && !fallbackName) {
    return null;
  }

  return {
    name: typeof raw?.name === 'string' ? raw.name : fallbackName || null,
    components,
  };
}

function getTemplateTextComponent(
  snapshot: ReturnType<typeof normalizeTemplateSnapshot>,
  type: 'HEADER' | 'BODY' | 'FOOTER',
) {
  if (!snapshot) {
    return null;
  }

  return snapshot.components.find((component) => component.type === type) || null;
}

function getTemplateButtons(snapshot: ReturnType<typeof normalizeTemplateSnapshot>) {
  if (!snapshot) {
    return [];
  }

  const buttonsComponent = snapshot.components.find((component) => component.type === 'BUTTONS');
  const buttons = buttonsComponent?.buttons;

  return Array.isArray(buttons)
    ? buttons.filter(
        (button): button is Record<string, unknown> =>
          Boolean(button) && typeof button === 'object' && !Array.isArray(button),
      )
    : [];
}

function RichText({ value }: { value: string }) {
  const lines = value.split('\n');

  const renderInline = (line: string) => {
    const parts = line.split(/(\*[^*]+\*|_[^_]+_)/g).filter(Boolean);

    return parts.map((part, index) => {
      if (part.startsWith('*') && part.endsWith('*')) {
        return (
          <strong key={`${part}-${index}`} className="font-semibold">
            {part.slice(1, -1)}
          </strong>
        );
      }

      if (part.startsWith('_') && part.endsWith('_')) {
        return (
          <em key={`${part}-${index}`} className="italic">
            {part.slice(1, -1)}
          </em>
        );
      }

      return <span key={`${part}-${index}`}>{part}</span>;
    });
  };

  return (
    <>
      {lines.map((line, index) => (
        <span key={`${line}-${index}`}>
          {renderInline(line)}
          {index < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </>
  );
}

function TemplatePreviewCard({ template }: { template: MetaTemplate | null }) {
  const snapshot = normalizeTemplateSnapshot(template?.raw || null, template?.name || 'Select a template');
  const headerComponent = getTemplateTextComponent(snapshot, 'HEADER');
  const bodyComponent = getTemplateTextComponent(snapshot, 'BODY');
  const footerComponent = getTemplateTextComponent(snapshot, 'FOOTER');
  const buttons = getTemplateButtons(snapshot);
  const headerText = typeof headerComponent?.text === 'string' ? headerComponent.text.trim() : '';
  const headerFormat = typeof headerComponent?.format === 'string' ? headerComponent.format : null;
  const bodyText = typeof bodyComponent?.text === 'string' ? bodyComponent.text.trim() : '';
  const footerText = typeof footerComponent?.text === 'string' ? footerComponent.text.trim() : '';

  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[2.25rem] bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
      <div className="rounded-[1.8rem] border border-gray-100 bg-[#f7f7f5] p-4">
        <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366]/10 text-[#25D366]">
              <Megaphone className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Connektly</p>
              <p className="text-[11px] text-gray-500">Campaign preview</p>
            </div>
          </div>
          <div className="text-xs text-gray-400">12:04</div>
        </div>

        <div className="mb-4 rounded-2xl bg-[#dff3f2] px-4 py-3 text-xs text-[#52656f]">
          This business uses a secure service from Meta to manage this chat. Tap to learn more
        </div>

        <div className="rounded-[1.5rem] bg-white p-5 shadow-sm">
          {headerFormat && headerFormat !== 'TEXT' ? (
            <div className="mb-4 rounded-2xl bg-gray-100 px-4 py-10 text-center text-sm font-medium text-gray-500">
              {headerFormat.charAt(0) + headerFormat.slice(1).toLowerCase()} header preview
            </div>
          ) : null}

          {headerText ? (
            <div className="mb-4 text-[1.02rem] font-bold text-gray-900">
              <RichText value={headerText} />
            </div>
          ) : null}

          <div className="text-[1rem] leading-7 text-gray-900">
            <RichText value={bodyText || snapshot?.name || 'Select an approved template to preview it here.'} />
          </div>

          {footerText ? (
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-sm text-gray-500">
                <RichText value={footerText} />
              </p>
              <span className="text-sm text-gray-400">12:04</span>
            </div>
          ) : null}

          {buttons.length > 0 ? (
            <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
              {buttons.map((button, index) => {
                const text = typeof button.text === 'string' ? button.text : `Action ${index + 1}`;
                const type = typeof button.type === 'string' ? button.type : 'QUICK_REPLY';

                return (
                  <div
                    key={`${text}-${index}`}
                    className="flex items-center justify-center gap-2 text-center text-[0.98rem] font-medium text-[#4e8ed8]"
                  >
                    {type === 'URL' ? <ArrowUpRight className="h-4 w-4" /> : <CornerDownLeft className="h-4 w-4" />}
                    <span>{text}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  step,
  title,
  description,
  children,
}: {
  step: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-400">{step}</p>
      <h3 className="mt-2 text-xl font-bold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-500">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function Broadcasts() {
  const { bootstrap } = useAppData();
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composer, setComposer] = useState<BroadcastComposerState>(createEmptyComposerState);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [importedAudience, setImportedAudience] = useState<AudienceImportRow[]>([]);
  const [audienceSearchQuery, setAudienceSearchQuery] = useState('');
  const deferredAudienceQuery = useDeferredValue(audienceSearchQuery);
  const [pastBroadcasts, setPastBroadcasts] = useState<PastBroadcastRecord[]>(getInitialPastBroadcasts);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);

  const contacts = bootstrap?.conversations || [];
  const approvedTemplates = useMemo(
    () => (bootstrap?.templates || []).filter((template) => (template.status || '').toLowerCase().includes('approve')),
    [bootstrap?.templates],
  );
  const selectedTemplate =
    approvedTemplates.find((template) => template.id === composer.templateId) || null;
  const filteredAudienceContacts = useMemo(() => {
    const normalizedQuery = deferredAudienceQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return contacts;
    }

    return contacts.filter((contact) => {
      const haystack = [
        contact.contactName,
        contact.displayPhone,
        contact.contactWaId,
        contact.labels.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [contacts, deferredAudienceQuery]);

  const audienceCount =
    composer.audienceSource === 'contacts' ? selectedContactIds.length : importedAudience.length;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(pastBroadcasts));
  }, [pastBroadcasts]);

  const updateComposer = <K extends keyof BroadcastComposerState>(
    field: K,
    value: BroadcastComposerState[K],
  ) => {
    setComposer((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetComposer = () => {
    setComposer(createEmptyComposerState());
    setSelectedContactIds([]);
    setImportedAudience([]);
    setAudienceSearchQuery('');
    setError(null);
  };

  const handleToggleContactSelection = (contactId: string) => {
    setSelectedContactIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId],
    );
  };

  const handleDownloadSampleCsv = () => {
    triggerFileDownload('campaign-audience-sample.csv', SAMPLE_AUDIENCE_CSV, 'text/csv;charset=utf-8');
    setNotice('Sample audience CSV downloaded.');
    setError(null);
  };

  const handleImportAudienceCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];

    if (!file) {
      return;
    }

    try {
      setIsImportingCsv(true);
      setError(null);
      setNotice(null);
      const text = await file.text();
      const records = parseCsvRecords(text);

      if (records.length === 0) {
        throw new Error('The CSV file is empty or missing data rows.');
      }

      const importedRows = records
        .map((record, index) => {
          const phone = getRecordValue(record, ['phone', 'displayPhone', 'whatsAppNumber']);

          if (!phone) {
            return null;
          }

          return {
            id: `${phone}-${index}`,
            name: getRecordValue(record, ['name', 'contactName']) || `Imported Contact ${index + 1}`,
            phone,
            labels: parseLabels(getRecordValue(record, ['labels'])),
          } satisfies AudienceImportRow;
        })
        .filter((record): record is AudienceImportRow => Boolean(record));

      if (importedRows.length === 0) {
        throw new Error('No valid phone numbers were found in the CSV file.');
      }

      setImportedAudience(importedRows);
      setComposer((current) => ({
        ...current,
        audienceSource: 'csv',
      }));
      setNotice(`Imported ${importedRows.length} audience contacts from CSV.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to import audience CSV.');
    } finally {
      setIsImportingCsv(false);
      event.currentTarget.value = '';
    }
  };

  const handleLaunchBroadcast = async () => {
    if (!composer.campaignName.trim()) {
      setError('A campaign name is required.');
      return;
    }

    if (!selectedTemplate) {
      setError('Select an approved template message before launching.');
      return;
    }

    if (audienceCount === 0) {
      setError('Choose at least one audience contact or import a CSV audience list.');
      return;
    }

    if (composer.timing === 'later' && (!composer.scheduledDate || !composer.scheduledTime)) {
      setError('Choose both the schedule date and schedule time.');
      return;
    }

    try {
      setIsLaunching(true);
      setError(null);
      setNotice(null);

      const scheduledFor =
        composer.timing === 'later'
          ? new Date(`${composer.scheduledDate}T${composer.scheduledTime}`).toISOString()
          : null;

      const nextBroadcast: PastBroadcastRecord = {
        id: crypto.randomUUID(),
        campaignName: composer.campaignName.trim(),
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        audienceCount,
        audienceSource: composer.audienceSource,
        timing: composer.timing,
        scheduledFor,
        status: composer.timing === 'later' ? 'Scheduled' : 'Queued',
        createdAt: new Date().toISOString(),
      };

      setPastBroadcasts((current) => [nextBroadcast, ...current]);
      setNotice(
        composer.timing === 'later'
          ? 'Campaign scheduled successfully.'
          : 'Campaign queued successfully.',
      );
      setIsComposerOpen(false);
      resetComposer();
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="mt-1 text-sm text-gray-500">
            Build WhatsApp campaigns with approved templates, a chosen audience, and flexible timing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsComposerOpen((current) => !current)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8]"
        >
          <Megaphone className="h-4 w-4" />
          {isComposerOpen ? 'Hide Campaign Builder' : 'Create New Campaign'}
          <ChevronDown className={`h-4 w-4 transition ${isComposerOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {notice ? (
        <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>
      ) : null}

      <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Past Campaigns</h2>
            <p className="mt-1 text-sm text-gray-500">Review launched or scheduled campaigns and their current status.</p>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            {pastBroadcasts.length} total
          </span>
        </div>

        {pastBroadcasts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Campaign</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Template</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Audience</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Delivery</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pastBroadcasts.map((broadcast) => (
                  <tr key={broadcast.id} className="hover:bg-gray-50/80">
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-gray-900">{broadcast.campaignName}</p>
                      <p className="mt-1 text-xs text-gray-500">Created {new Date(broadcast.createdAt).toLocaleString()}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{broadcast.templateName}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {broadcast.audienceCount} recipients
                      <p className="mt-1 text-xs text-gray-500">
                        Source: {broadcast.audienceSource === 'contacts' ? 'Contacts list' : 'CSV import'}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {broadcast.timing === 'later' && broadcast.scheduledFor
                        ? new Date(broadcast.scheduledFor).toLocaleString()
                        : 'Send now'}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                          broadcast.status === 'Scheduled'
                            ? 'border border-amber-100 bg-amber-50 text-amber-700'
                            : 'border border-blue-100 bg-blue-50 text-blue-700'
                        }`}
                      >
                        {broadcast.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
              <Megaphone className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-semibold text-gray-900">No campaigns yet</p>
            <p className="mt-2 text-sm text-gray-500">
              Create your first campaign and it will appear here with its current status.
            </p>
          </div>
        )}
      </section>

      <AnimatePresence initial={false}>
        {isComposerOpen ? (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"
          >
            <div className="space-y-6">
              <SectionCard
                step="Step 1"
                title="What message do you want to send?"
                description="Give the campaign a clear name and choose an approved WhatsApp template message."
              >
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Campaign Name</label>
                    <input
                      type="text"
                      value={composer.campaignName}
                      onChange={(event) => updateComposer('campaignName', event.target.value)}
                      placeholder="Festival Promo - April"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Select Template Message</label>
                    <select
                      value={composer.templateId}
                      onChange={(event) => updateComposer('templateId', event.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    >
                      <option value="">Choose an approved template</option>
                      {approvedTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {approvedTemplates.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    No approved templates are available yet. Approve a template first in the Templates section.
                  </div>
                ) : null}
              </SectionCard>

              <SectionCard
                step="Step 2"
                title="Who is your audience?"
                description="Pick contacts from your workspace or import a CSV audience list. You can also download a sample CSV first."
              >
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => updateComposer('audienceSource', 'contacts')}
                    className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                      composer.audienceSource === 'contacts'
                        ? 'bg-[#5b45ff] text-white'
                        : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Select From Contacts
                  </button>
                  <button
                    type="button"
                    onClick={() => updateComposer('audienceSource', 'csv')}
                    className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                      composer.audienceSource === 'csv'
                        ? 'bg-[#5b45ff] text-white'
                        : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Import Contacts via CSV
                  </button>
                </div>

                {composer.audienceSource === 'contacts' ? (
                  <div className="mt-5 space-y-4">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={audienceSearchQuery}
                        onChange={(event) => setAudienceSearchQuery(event.target.value)}
                        placeholder="Search contacts by name, phone, or label"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                      />
                    </div>

                    <div className="max-h-[320px] overflow-y-auto rounded-2xl border border-gray-200">
                      {filteredAudienceContacts.length > 0 ? (
                        filteredAudienceContacts.map((contact) => {
                          const isSelected = selectedContactIds.includes(contact.id);

                          return (
                            <label
                              key={contact.id}
                              className={`flex cursor-pointer items-start gap-3 border-b border-gray-100 px-4 py-3 text-sm last:border-b-0 ${
                                isSelected ? 'bg-[#f5f3ff]' : 'hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleContactSelection(contact.id)}
                                className="mt-1 h-4 w-4 rounded border-gray-300 text-[#5b45ff] focus:ring-[#5b45ff]"
                              />
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900">
                                  {contact.contactName || contact.displayPhone || contact.contactWaId}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                  {contact.displayPhone || contact.contactWaId}
                                </p>
                              </div>
                            </label>
                          );
                        })
                      ) : (
                        <div className="px-4 py-10 text-center text-sm text-gray-500">
                          No contacts match your search.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleDownloadSampleCsv}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        <Download className="h-4 w-4" />
                        Download Sample CSV
                      </button>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
                        {isImportingCsv ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                        Import Audience CSV
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          onChange={handleImportAudienceCsv}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                      <p className="text-sm font-medium text-gray-900">Imported audience</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {importedAudience.length > 0
                          ? `${importedAudience.length} contacts are ready for this campaign.`
                          : 'No CSV audience has been imported yet.'}
                      </p>
                    </div>

                    {importedAudience.length > 0 ? (
                      <div className="max-h-[320px] overflow-y-auto rounded-2xl border border-gray-200 bg-white">
                        {importedAudience.map((row) => (
                          <div key={row.id} className="border-b border-gray-100 px-4 py-3 last:border-b-0">
                            <p className="text-sm font-medium text-gray-900">{row.name}</p>
                            <p className="mt-1 text-xs text-gray-500">{row.phone}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </SectionCard>

              <SectionCard
                step="Step 3"
                title="When do you want to send it?"
                description="Choose whether to send immediately or schedule the campaign for later."
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => updateComposer('timing', 'now')}
                      className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                        composer.timing === 'now'
                          ? 'bg-[#5b45ff] text-white'
                          : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Send className="mr-2 inline h-4 w-4" />
                      Send Now
                    </button>
                    <button
                      type="button"
                      onClick={() => updateComposer('timing', 'later')}
                      className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                        composer.timing === 'later'
                          ? 'bg-[#5b45ff] text-white'
                          : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <CalendarDays className="mr-2 inline h-4 w-4" />
                      Schedule For Later
                    </button>
                  </div>

                  {composer.timing === 'later' ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">Date</label>
                        <input
                          type="date"
                          value={composer.scheduledDate}
                          onChange={(event) => updateComposer('scheduledDate', event.target.value)}
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">Time</label>
                        <input
                          type="time"
                          value={composer.scheduledTime}
                          onChange={(event) => updateComposer('scheduledTime', event.target.value)}
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </SectionCard>

              <div className="flex items-center justify-between rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Ready to launch?</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Campaign: {composer.campaignName || 'Not named yet'} - Audience: {audienceCount} recipient{audienceCount === 1 ? '' : 's'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleLaunchBroadcast()}
                  disabled={isLaunching}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#111827] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#1f2937] disabled:opacity-60"
                >
                  {isLaunching ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Launch Campaign
                </button>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5b45ff]">Live Preview</p>
                    <h3 className="mt-2 text-lg font-bold text-gray-900">
                      {selectedTemplate?.name || 'Template preview'}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      See the selected approved template exactly as it would appear in WhatsApp.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[#f5f3ff] px-3 py-2 text-right">
                    <p className="text-xs font-medium uppercase tracking-wide text-[#5b45ff]">Audience</p>
                    <p className="mt-1 text-lg font-bold text-[#2b1f77]">{audienceCount}</p>
                  </div>
                </div>

                <TemplatePreviewCard template={selectedTemplate} />

                <div className="mt-5 grid gap-3">
                  <div className="rounded-2xl bg-gray-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Audience source</p>
                    <p className="mt-2 text-sm font-medium text-gray-900">
                      {composer.audienceSource === 'contacts' ? 'Workspace contacts' : 'CSV import'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Delivery</p>
                    <p className="mt-2 text-sm font-medium text-gray-900">
                      {composer.timing === 'later' && composer.scheduledDate && composer.scheduledTime
                        ? `${composer.scheduledDate} at ${composer.scheduledTime}`
                        : 'Send immediately'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
