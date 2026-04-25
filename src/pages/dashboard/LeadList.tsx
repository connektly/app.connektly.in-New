import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { CalendarDays, Download, FileSpreadsheet, History, Loader2, Pencil, Plus, Save, Search, UserPlus, X } from 'lucide-react';
import { appApi } from '../../lib/api';
import { useAppData } from '../../context/AppDataContext';
import { upsertConversationThread } from '../../lib/conversations';
import { formatContactIdentity } from '../../lib/phone';
import { useEscapeKey } from '../../lib/useEscapeKey';
import type { ConversationMessage, ConversationThread } from '../../lib/types';

const STAGE_OPTIONS: Array<'all' | ConversationThread['status']> = ['all', 'New', 'In progress', 'Waiting', 'Completed'];

interface LeadFormState {
  contactName: string;
  displayPhone: string;
  email: string;
  ownerName: string;
  source: string;
  status: ConversationThread['status'];
  remark: string;
}

interface UpdateFormState {
  ownerName: string;
  status: ConversationThread['status'];
  remark: string;
}

function getLeadName(thread: ConversationThread) {
  return thread.contactName || thread.displayPhone || thread.contactWaId;
}

function getLeadPhone(thread: ConversationThread) {
  return thread.displayPhone || formatContactIdentity(thread.contactWaId) || thread.contactWaId;
}

function getLeadSource(thread: ConversationThread) {
  if (thread.source?.trim()) return thread.source.trim();
  if (thread.labels.some((label) => label.toLowerCase() === 'meta lead')) return 'Meta';
  return 'Manual';
}

function getLeadRemark(thread: ConversationThread) {
  return thread.remark?.trim() || '';
}

function normalizeStage(value: string | null | undefined): ConversationThread['status'] {
  if (value === 'In progress' || value === 'Waiting' || value === 'Completed') return value;
  return 'New';
}

function formatDateTime(value: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function getTimestamp(value: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getStageClassName(status: ConversationThread['status']) {
  switch (status) {
    case 'New':
      return 'border border-emerald-100 bg-emerald-50 text-emerald-700';
    case 'In progress':
      return 'border border-blue-100 bg-blue-50 text-blue-700';
    case 'Waiting':
      return 'border border-amber-100 bg-amber-50 text-amber-700';
    default:
      return 'border border-slate-200 bg-slate-100 text-slate-700';
  }
}

function buildLeadForm(lead: ConversationThread | null, defaultOwner: string): LeadFormState {
  return {
    contactName: lead?.contactName || '',
    displayPhone: lead ? getLeadPhone(lead) : '',
    email: lead?.email || '',
    ownerName: lead?.ownerName || defaultOwner,
    source: lead ? getLeadSource(lead) : 'Manual',
    status: lead?.status || 'New',
    remark: lead ? getLeadRemark(lead) : '',
  };
}

function buildUpdateForm(lead: ConversationThread | null, defaultOwner: string): UpdateFormState {
  return {
    ownerName: lead?.ownerName || defaultOwner,
    status: lead?.status || 'New',
    remark: lead ? getLeadRemark(lead) : '',
  };
}

function normalizeCsvHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function escapeCsvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let insideQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (insideQuotes && next === '"') {
        value += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }
    if (char === ',' && !insideQuotes) {
      row.push(value.trim());
      value = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value.trim());
      value = '';
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    value += char;
  }
  if (value.length > 0 || row.length > 0) {
    row.push(value.trim());
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }
  return rows;
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  useEscapeKey(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/40 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(90vh-88px)] overflow-y-auto px-6 py-6">{children}</div>
      </div>
    </div>
  );
}

function LeadEditor({
  form,
  setForm,
  onClose,
  onSubmit,
  submitLabel,
  isSubmitting,
}: {
  form: LeadFormState;
  setForm: Dispatch<SetStateAction<LeadFormState>>;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  isSubmitting: boolean;
}) {
  return (
    <>
      <div className="grid gap-5 md:grid-cols-2">
        {[
          ['Name', 'contactName', 'text'],
          ['Phone Number', 'displayPhone', 'text'],
          ['Email', 'email', 'email'],
          ['Lead Owner', 'ownerName', 'text'],
          ['Source', 'source', 'text'],
        ].map(([label, key, type]) => (
          <label key={key} className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">{label}</span>
            <input
              type={type}
              value={form[key as keyof LeadFormState] as string}
              onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
            />
          </label>
        ))}
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-gray-700">Stage</span>
          <select
            value={form.status}
            onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ConversationThread['status'] }))}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
          >
            {STAGE_OPTIONS.filter((stage) => stage !== 'all').map((stage) => <option key={stage} value={stage}>{stage}</option>)}
          </select>
        </label>
        <label className="block md:col-span-2">
          <span className="mb-2 block text-sm font-medium text-gray-700">Remark</span>
          <textarea
            value={form.remark}
            onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
            rows={4}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
          />
        </label>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onClose} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50">Cancel</button>
        <button type="button" onClick={onSubmit} disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8] disabled:opacity-60">
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {submitLabel}
        </button>
      </div>
    </>
  );
}

export default function LeadList() {
  const { bootstrap, setBootstrap } = useAppData();
  const leads = bootstrap?.conversations || [];
  const defaultOwnerName = bootstrap?.profile?.fullName || '';
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | ConversationThread['status']>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editLeadId, setEditLeadId] = useState<string | null>(null);
  const [updateLeadId, setUpdateLeadId] = useState<string | null>(null);
  const [timelineLeadId, setTimelineLeadId] = useState<string | null>(null);
  const [leadForm, setLeadForm] = useState<LeadFormState>(() => buildLeadForm(null, defaultOwnerName));
  const [updateForm, setUpdateForm] = useState<UpdateFormState>(() => buildUpdateForm(null, defaultOwnerName));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [timelineMessages, setTimelineMessages] = useState<ConversationMessage[]>([]);
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const deferredQuery = useDeferredValue(searchQuery);
  const editLead = leads.find((lead) => lead.id === editLeadId) || null;
  const updateLead = leads.find((lead) => lead.id === updateLeadId) || null;
  const timelineLead = leads.find((lead) => lead.id === timelineLeadId) || null;

  useEffect(() => {
    if (isCreateModalOpen) setLeadForm(buildLeadForm(null, defaultOwnerName));
  }, [defaultOwnerName, isCreateModalOpen]);

  useEffect(() => {
    if (editLead) setLeadForm(buildLeadForm(editLead, defaultOwnerName));
  }, [defaultOwnerName, editLead]);

  useEffect(() => {
    if (updateLead) setUpdateForm(buildUpdateForm(updateLead, defaultOwnerName));
  }, [defaultOwnerName, updateLead]);

  useEffect(() => {
    if (!timelineLead) {
      setTimelineMessages([]);
      setTimelineError(null);
      setIsTimelineLoading(false);
      return;
    }
    let cancelled = false;
    const loadTimeline = async () => {
      try {
        setIsTimelineLoading(true);
        setTimelineError(null);
        const response = await appApi.getMessages(timelineLead.id, { markRead: false });
        if (cancelled) return;
        setTimelineMessages(response.messages);
        setBootstrap((current) => current ? ({ ...current, conversations: upsertConversationThread(current.conversations, response.thread) }) : current);
      } catch (error) {
        if (!cancelled) setTimelineError(error instanceof Error ? error.message : 'Failed to load the lead timeline.');
      } finally {
        if (!cancelled) setIsTimelineLoading(false);
      }
    };
    void loadTimeline();
    return () => {
      cancelled = true;
    };
  }, [setBootstrap, timelineLead]);

  const filteredLeads = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return [...leads]
      .filter((lead) => {
        if (stageFilter !== 'all' && lead.status !== stageFilter) return false;
        if (!normalizedQuery) return true;
        const haystack = [
          getLeadName(lead),
          getLeadPhone(lead),
          lead.email,
          lead.ownerName,
          getLeadSource(lead),
          lead.status,
          lead.remark,
          lead.labels.join(' '),
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .sort((left, right) => getTimestamp(right.createdAt) - getTimestamp(left.createdAt));
  }, [deferredQuery, leads, stageFilter]);

  const stats = useMemo(() => ({
    total: leads.length,
    new: leads.filter((lead) => lead.status === 'New').length,
    active: leads.filter((lead) => lead.status === 'In progress').length,
    completed: leads.filter((lead) => lead.status === 'Completed').length,
  }), [leads]);

  const syncLead = (lead: ConversationThread) => {
    setBootstrap((current) => current ? ({ ...current, conversations: upsertConversationThread(current.conversations, lead) }) : current);
  };

  const handleCreateLead = async () => {
    try {
      setIsSubmitting(true);
      setFeedback(null);
      const response = await appApi.createContact({
        contactWaId: leadForm.displayPhone,
        contactName: leadForm.contactName,
        displayPhone: leadForm.displayPhone,
        email: leadForm.email,
        ownerName: leadForm.ownerName,
        source: leadForm.source || 'Manual',
        status: leadForm.status,
        remark: leadForm.remark,
        labels: leadForm.source.trim().toLowerCase() === 'meta lead capture' ? ['meta lead'] : [],
      });
      syncLead(response.contact);
      setIsCreateModalOpen(false);
      setFeedback({ type: 'success', message: 'Lead created successfully.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to create the lead.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditLead = async () => {
    if (!editLead) return;
    try {
      setIsSubmitting(true);
      setFeedback(null);
      const response = await appApi.updateContact(editLead.id, {
        contactName: leadForm.contactName,
        displayPhone: leadForm.displayPhone,
        email: leadForm.email,
        ownerName: leadForm.ownerName,
        source: leadForm.source,
        status: leadForm.status,
        remark: leadForm.remark,
      });
      syncLead(response.contact);
      setEditLeadId(null);
      setFeedback({ type: 'success', message: 'Lead details updated.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to update the lead.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickUpdate = async () => {
    if (!updateLead) return;
    try {
      setIsSubmitting(true);
      setFeedback(null);
      const response = await appApi.updateContact(updateLead.id, {
        ownerName: updateForm.ownerName,
        status: updateForm.status,
        remark: updateForm.remark,
      });
      syncLead(response.contact);
      setUpdateLeadId(null);
      setFeedback({ type: 'success', message: 'Lead stage updated.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to update the lead stage.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = () => {
    const lines = [
      ['Name', 'Phone Number', 'Email', 'Lead Owner', 'Source', 'Stage', 'Date Created', 'Remark'].join(','),
      ...filteredLeads.map((lead) => [
        getLeadName(lead),
        getLeadPhone(lead),
        lead.email || '',
        lead.ownerName || '',
        getLeadSource(lead),
        lead.status,
        formatDateTime(lead.createdAt),
        getLeadRemark(lead),
      ].map((value) => escapeCsvCell(value)).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `connektly-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setIsImporting(true);
      setFeedback(null);
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) throw new Error('The CSV file is empty.');
      const headers = rows[0].map(normalizeCsvHeader);
      let successCount = 0;
      let skippedCount = 0;
      for (const row of rows.slice(1)) {
        const values = headers.reduce<Record<string, string>>((accumulator, header, index) => {
          accumulator[header] = row[index]?.trim() || '';
          return accumulator;
        }, {});
        const phone = values.phonenumber || values.phone || values.whatsappnumber || values.whatsapp || values.mobile || values.number;
        if (!phone) {
          skippedCount += 1;
          continue;
        }
        const response = await appApi.createContact({
          contactWaId: phone,
          contactName: values.name || values.leadname || values.fullname || values.contactname || '',
          displayPhone: phone,
          email: values.email || values.emailaddress || '',
          ownerName: values.leadowner || values.owner || values.ownername || defaultOwnerName,
          source: values.source || values.leadsource || 'CSV Import',
          status: normalizeStage(values.stage || values.status),
          remark: values.remark || values.remarks || values.note || values.notes || '',
        });
        syncLead(response.contact);
        successCount += 1;
      }
      setFeedback({ type: 'success', message: `CSV import finished. ${successCount} lead${successCount === 1 ? '' : 's'} added${skippedCount ? `, ${skippedCount} row${skippedCount === 1 ? '' : 's'} skipped` : ''}.` });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to import leads from CSV.' });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setIsImporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead List</h1>
          <p className="mt-1 text-sm text-gray-500">Manage every CRM lead in one table with owner, source, stage, created date, and remark.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => setIsCreateModalOpen(true)} className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8]"><Plus className="h-4 w-4" /> Create Lead</button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isImporting} className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60">{isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Import via CSV</button>
          <button type="button" onClick={handleExport} className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"><Download className="h-4 w-4" /> Export</button>
        </div>
      </div>

      {feedback ? <div className={`rounded-2xl border px-4 py-3 text-sm ${feedback.type === 'success' ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-rose-100 bg-rose-50 text-rose-700'}`}>{feedback.message}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total leads', value: stats.total, icon: UserPlus },
          { label: 'New leads', value: stats.new, icon: Plus },
          { label: 'Active pipeline', value: stats.active, icon: Save },
          { label: 'Completed', value: stats.completed, icon: CalendarDays },
        ].map((item) => (
          <div key={item.label} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-gray-500">{item.label}</p>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4338ca]"><item.icon className="h-5 w-5" /></div>
            </div>
            <p className="mt-5 text-3xl font-bold text-gray-900">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Search leads</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by name, phone, email, owner, source, stage, or remark" className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]" />
            </div>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Stage</span>
            <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value as 'all' | ConversationThread['status'])} className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]">
              {STAGE_OPTIONS.map((stage) => <option key={stage} value={stage}>{stage === 'all' ? 'All stages' : stage}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        {filteredLeads.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Name', 'Phone Number', 'Email', 'Lead Owner', 'Source', 'Stage', 'Date Created', 'Remark'].map((label) => <th key={label} className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</th>)}
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="align-top transition-colors hover:bg-gray-50">
                    <td className="px-6 py-4"><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#25D366]/10 font-semibold text-[#25D366]">{getLeadName(lead).charAt(0).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-900">{getLeadName(lead)}</p><p className="mt-1 truncate text-xs text-gray-500">WA ID: {formatContactIdentity(lead.contactWaId) || lead.contactWaId}</p></div></div></td>
                    <td className="px-6 py-4 text-sm text-gray-700">{getLeadPhone(lead)}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{lead.email || 'Not available'}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{lead.ownerName || 'Unassigned'}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{getLeadSource(lead)}</td>
                    <td className="px-6 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStageClassName(lead.status)}`}>{lead.status}</span></td>
                    <td className="px-6 py-4 text-sm text-gray-700">{formatDateTime(lead.createdAt)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600"><p className="max-w-[260px] whitespace-pre-wrap break-words">{getLeadRemark(lead) || 'No remark'}</p></td>
                    <td className="px-6 py-4"><div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setEditLeadId(lead.id)} className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                      <button type="button" onClick={() => setUpdateLeadId(lead.id)} className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"><Save className="h-3.5 w-3.5" /> Update</button>
                      <button type="button" onClick={() => setTimelineLeadId(lead.id)} className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"><History className="h-3.5 w-3.5" /> Timeline</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="px-6 py-16 text-center"><UserPlus className="mx-auto h-10 w-10 text-gray-300" /><h2 className="mt-4 text-lg font-semibold text-gray-900">No leads to show</h2><p className="mx-auto mt-2 max-w-xl text-sm text-gray-500">Create a lead manually, import one from CSV, or let your live channels keep adding them here.</p></div>}
      </div>

      {isCreateModalOpen ? <ModalShell title="Create Lead" subtitle="Add a lead manually into CRM." onClose={() => setIsCreateModalOpen(false)}><LeadEditor form={leadForm} setForm={setLeadForm} onClose={() => setIsCreateModalOpen(false)} onSubmit={() => void handleCreateLead()} submitLabel="Save Lead" isSubmitting={isSubmitting} /></ModalShell> : null}
      {editLead ? <ModalShell title="Edit Lead" subtitle={`Update the core details for ${getLeadName(editLead)}.`} onClose={() => setEditLeadId(null)}><LeadEditor form={leadForm} setForm={setLeadForm} onClose={() => setEditLeadId(null)} onSubmit={() => void handleEditLead()} submitLabel="Save Changes" isSubmitting={isSubmitting} /></ModalShell> : null}
      {updateLead ? <ModalShell title="Update Lead" subtitle={`Move ${getLeadName(updateLead)} through the pipeline or leave a fresh remark.`} onClose={() => setUpdateLeadId(null)}>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block"><span className="mb-2 block text-sm font-medium text-gray-700">Lead Owner</span><input type="text" value={updateForm.ownerName} onChange={(event) => setUpdateForm((current) => ({ ...current, ownerName: event.target.value }))} className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]" /></label>
          <label className="block"><span className="mb-2 block text-sm font-medium text-gray-700">Stage</span><select value={updateForm.status} onChange={(event) => setUpdateForm((current) => ({ ...current, status: event.target.value as ConversationThread['status'] }))} className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]">{STAGE_OPTIONS.filter((stage) => stage !== 'all').map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select></label>
          <label className="block md:col-span-2"><span className="mb-2 block text-sm font-medium text-gray-700">Remark</span><textarea value={updateForm.remark} onChange={(event) => setUpdateForm((current) => ({ ...current, remark: event.target.value }))} rows={4} className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]" /></label>
        </div>
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setUpdateLeadId(null)} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50">Cancel</button><button type="button" onClick={() => void handleQuickUpdate()} disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8] disabled:opacity-60">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Update Lead</button></div>
      </ModalShell> : null}
      {timelineLead ? <ModalShell title="Lead Timeline" subtitle={`Full activity timeline for ${getLeadName(timelineLead)}.`} onClose={() => setTimelineLeadId(null)}>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Phone Number</p><p className="mt-2 text-sm font-medium text-gray-900">{getLeadPhone(timelineLead)}</p></div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Date Created</p><p className="mt-2 text-sm font-medium text-gray-900">{formatDateTime(timelineLead.createdAt)}</p></div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Stage</p><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStageClassName(timelineLead.status)}`}>{timelineLead.status}</span></div>
        </div>
        {isTimelineLoading ? <div className="flex min-h-[220px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#5b45ff]" /></div> : timelineError ? <div className="mt-6 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{timelineError}</div> : <div className="mt-6 space-y-4">{timelineMessages.length ? timelineMessages.map((message) => <div key={message.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${message.direction === 'inbound' ? 'border border-emerald-100 bg-emerald-50 text-emerald-700' : 'border border-blue-100 bg-blue-50 text-blue-700'}`}>{message.direction === 'inbound' ? 'Inbound' : 'Outbound'}</span><span className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">{message.messageType}</span></div><span className="text-xs text-gray-500">{formatDateTime(message.createdAt)}</span></div><p className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-700">{message.body || 'No message body recorded for this event.'}</p>{message.status ? <p className="mt-2 text-xs text-gray-500">Status: {message.status}</p> : null}</div>) : <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">No timeline events are available for this lead yet.</div>}</div>}
      </ModalShell> : null}
    </div>
  );
}
