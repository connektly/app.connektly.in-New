import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Command,
  Loader2,
  MessageSquareText,
  Phone,
  Plus,
  RefreshCcw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { appApi } from '../../lib/api';
import { useAppData } from '../../context/AppDataContext';
import type {
  WhatsAppAutomationCommand,
  WhatsAppConversationalAutomationConfig,
  WhatsAppConversationalAutomationUpdateInput,
} from '../../lib/types';

interface CommandDraft extends WhatsAppAutomationCommand {
  id: string;
}

interface AutomationFormState {
  enableWelcomeMessage: boolean;
  prompts: string[];
  commands: CommandDraft[];
}

function createCommandDraft(command?: Partial<WhatsAppAutomationCommand>): CommandDraft {
  return {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    commandName: command?.commandName || '',
    commandDescription: command?.commandDescription || '',
  };
}

function buildFormState(config: WhatsAppConversationalAutomationConfig | null): AutomationFormState {
  return {
    enableWelcomeMessage: config?.enableWelcomeMessage || false,
    prompts: config?.prompts.length ? [...config.prompts] : [],
    commands: config?.commands.length
      ? config.commands.map((command) => createCommandDraft(command))
      : [],
  };
}

function normalizePrompt(value: string) {
  return value.trim();
}

function normalizeCommandName(value: string) {
  return value
    .trim()
    .replace(/^\/+/, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase();
}

function buildPayloadFromForm(form: AutomationFormState): WhatsAppConversationalAutomationUpdateInput {
  const prompts = Array.from(
    new Set(form.prompts.map(normalizePrompt).filter(Boolean)),
  );
  const seenCommands = new Set<string>();
  const commands: WhatsAppAutomationCommand[] = [];

  for (const command of form.commands) {
    const rawName = command.commandName.trim();
    const rawDescription = command.commandDescription.trim();

    if (!rawName && !rawDescription) {
      continue;
    }

    const commandName = normalizeCommandName(rawName);

    if (!commandName) {
      throw new Error('Bot command names can only use letters, numbers, and underscores.');
    }

    if (!rawDescription) {
      throw new Error(`Add a description for /${commandName}.`);
    }

    if (seenCommands.has(commandName)) {
      throw new Error(`/${commandName} is duplicated. Use unique command names.`);
    }

    seenCommands.add(commandName);
    commands.push({
      commandName,
      commandDescription: rawDescription,
    });
  }

  return {
    enableWelcomeMessage: form.enableWelcomeMessage,
    prompts,
    commands,
  };
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not synced yet';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not synced yet' : parsed.toLocaleString();
}

function SectionCard({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="pt-5">{children}</div>
    </section>
  );
}

function AutomationStatCard({
  title,
  value,
  detail,
  tone,
  icon,
}: {
  title: string;
  value: string;
  detail: string;
  tone: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-3 text-3xl font-semibold text-gray-900">{value}</p>
          <p className="mt-2 text-sm text-gray-500">{detail}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}>{icon}</div>
      </div>
    </div>
  );
}

function AutomationSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-36 animate-pulse rounded-[24px] border border-gray-200 bg-white" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
        <div className="space-y-6">
          <div className="h-64 animate-pulse rounded-[28px] border border-gray-200 bg-white" />
          <div className="h-72 animate-pulse rounded-[28px] border border-gray-200 bg-white" />
          <div className="h-80 animate-pulse rounded-[28px] border border-gray-200 bg-white" />
        </div>
        <div className="h-[560px] animate-pulse rounded-[28px] border border-gray-200 bg-white" />
      </div>
    </div>
  );
}

export default function Automations() {
  const { bootstrap } = useAppData();
  const channel = bootstrap?.channel || null;
  const [config, setConfig] = useState<WhatsAppConversationalAutomationConfig | null>(null);
  const [form, setForm] = useState<AutomationFormState>(() => buildFormState(null));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!channel?.phoneNumberId) {
      setConfig(null);
      setForm(buildFormState(null));
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await appApi.getConversationalAutomation();

        if (cancelled) {
          return;
        }

        setConfig(response.config);
        setForm(buildFormState(response.config));
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'Failed to load WhatsApp automation settings.',
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [channel?.phoneNumberId]);

  const previewPrompts = useMemo(
    () => form.prompts.map(normalizePrompt).filter(Boolean),
    [form.prompts],
  );
  const previewCommands = useMemo(() => {
    try {
      return buildPayloadFromForm(form).commands;
    } catch {
      return form.commands
        .map((command) => ({
          commandName: normalizeCommandName(command.commandName),
          commandDescription: command.commandDescription.trim(),
        }))
        .filter((command) => command.commandName || command.commandDescription);
    }
  }, [form]);
  const syncSummary = useMemo(() => {
    if (config?.lastError) {
      return {
        label: 'Needs attention',
        tone: 'border-red-100 bg-red-50 text-red-700',
      };
    }

    if (config?.lastSyncedAt) {
      return {
        label: 'Live on WhatsApp',
        tone: 'border-emerald-100 bg-emerald-50 text-emerald-700',
      };
    }

    return {
      label: 'Draft only',
      tone: 'border-gray-200 bg-gray-50 text-gray-700',
    };
  }, [config?.lastError, config?.lastSyncedAt]);

  const handleReload = async () => {
    if (!channel?.phoneNumberId) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setSuccess(null);
      const response = await appApi.getConversationalAutomation();
      setConfig(response.config);
      setForm(buildFormState(response.config));
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to refresh WhatsApp automation settings.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    let payload: WhatsAppConversationalAutomationUpdateInput | null = null;

    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);
      payload = buildPayloadFromForm(form);
      const response = await appApi.updateConversationalAutomation(payload);
      setConfig(response.config);
      setForm(buildFormState(response.config));
      setSuccess('Automation settings were updated on WhatsApp.');
    } catch (nextError) {
      const message =
        nextError instanceof Error
          ? nextError.message
          : 'Failed to update WhatsApp automation settings.';

      if (payload) {
        setConfig((current) =>
          current
            ? {
                ...current,
                enableWelcomeMessage: Boolean(payload?.enableWelcomeMessage),
                prompts: payload?.prompts || [],
                commands: payload?.commands || [],
                lastError: message,
              }
            : current,
        );
      }

      setError(
        message,
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!channel) {
    return (
      <div className="space-y-6 p-6">
        <div className="rounded-[32px] border border-gray-200 bg-white px-8 py-10 shadow-sm">
          <div className="max-w-3xl">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef3ff] text-[#4f46e5]">
              <Sparkles className="h-7 w-7" />
            </div>
            <h1 className="mt-6 text-3xl font-semibold text-gray-900">Automations</h1>
            <p className="mt-3 text-base leading-7 text-gray-600">
              Connect a WhatsApp Business number first, then you can turn on welcome messages,
              add conversation prompts, and publish bot commands.
            </p>
            <div className="mt-6">
              <Link
                to="/dashboard/channels"
                className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8]"
              >
                Open Channels
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#5b45ff]">
            WhatsApp Automation
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-gray-900">Automations</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-gray-600">
            Manage the automation surfaces customers see in WhatsApp: welcome messages, ice
            breakers, and slash commands.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleReload()}
            disabled={isLoading || isSaving}
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isLoading || isSaving}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/20 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {success ? (
        <div className="flex items-start gap-3 rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{success}</span>
        </div>
      ) : null}

      {isLoading ? (
        <AutomationSkeleton />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AutomationStatCard
              title="Welcome message"
              value={form.enableWelcomeMessage ? 'On' : 'Off'}
              detail="Shown when someone opens a new conversation."
              tone="bg-[#eef3ff] text-[#5b45ff]"
              icon={<MessageSquareText className="h-5 w-5" />}
            />
            <AutomationStatCard
              title="Conversation prompts"
              value={String(previewPrompts.length)}
              detail="Quick starters shown before the first reply."
              tone="bg-[#effaf4] text-emerald-600"
              icon={<Sparkles className="h-5 w-5" />}
            />
            <AutomationStatCard
              title="Bot commands"
              value={String(previewCommands.length)}
              detail="Slash commands customers can use in chat."
              tone="bg-[#f3f1ff] text-[#5b45ff]"
              icon={<Command className="h-5 w-5" />}
            />
            <AutomationStatCard
              title="Connected number"
              value={channel.displayPhoneNumber || channel.phoneNumberId}
              detail="The active WhatsApp Business number for this workspace."
              tone="bg-[#fff6e8] text-amber-600"
              icon={<Phone className="h-5 w-5" />}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
            <div className="space-y-6">
              <SectionCard
                title="Welcome message"
                description="Turn WhatsApp's welcome message on or off for new inbound conversations."
                actions={
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        enableWelcomeMessage: !current.enableWelcomeMessage,
                      }))
                    }
                    className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                      form.enableWelcomeMessage
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {form.enableWelcomeMessage ? 'Enabled' : 'Disabled'}
                  </button>
                }
              >
                <div className="rounded-[24px] border border-dashed border-gray-200 bg-gray-50 p-5">
                  <p className="text-sm font-medium text-gray-700">
                    Welcome messages do not use a custom text field here. WhatsApp shows its
                    welcome surface automatically when this setting is enabled.
                  </p>
                </div>
              </SectionCard>

              <SectionCard
                title="Conversation prompts"
                description="Add opening prompts to help customers start the conversation faster."
                actions={
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        prompts: [...current.prompts, ''],
                      }))
                    }
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    <Plus className="h-4 w-4" />
                    Add prompt
                  </button>
                }
              >
                <div className="space-y-4">
                  {form.prompts.length ? (
                    form.prompts.map((prompt, index) => (
                      <div
                        key={`${index}-${prompt}`}
                        className="rounded-[24px] border border-gray-200 bg-gray-50 p-4"
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-gray-700">
                            Prompt {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                prompts: current.prompts.filter((_, promptIndex) => promptIndex !== index),
                              }))
                            }
                            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <textarea
                          value={prompt}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              prompts: current.prompts.map((currentPrompt, promptIndex) =>
                                promptIndex === index ? event.target.value : currentPrompt,
                              ),
                            }))
                          }
                          rows={2}
                          placeholder="For example: Check pricing"
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        />
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-gray-200 bg-gray-50 px-5 py-8 text-center">
                      <p className="text-sm text-gray-600">
                        No conversation prompts yet. Add the questions customers ask most often.
                      </p>
                    </div>
                  )}
                </div>
              </SectionCard>

              <SectionCard
                title="Bot commands"
                description="Create slash commands customers can use directly inside the WhatsApp chat."
                actions={
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        commands: [...current.commands, createCommandDraft()],
                      }))
                    }
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    <Plus className="h-4 w-4" />
                    Add command
                  </button>
                }
              >
                <div className="space-y-4">
                  {form.commands.length ? (
                    form.commands.map((command, index) => (
                      <div
                        key={command.id}
                        className="rounded-[24px] border border-gray-200 bg-gray-50 p-4"
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-gray-700">
                            Command {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                commands: current.commands.filter(
                                  (currentCommand) => currentCommand.id !== command.id,
                                ),
                              }))
                            }
                            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
                          <label className="block">
                            <span className="mb-2 block text-sm font-medium text-gray-700">
                              Command name
                            </span>
                            <div className="flex items-center rounded-2xl border border-gray-200 bg-white px-4">
                              <span className="text-sm font-semibold text-[#5b45ff]">/</span>
                              <input
                                type="text"
                                value={command.commandName}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    commands: current.commands.map((currentCommand) =>
                                      currentCommand.id === command.id
                                        ? { ...currentCommand, commandName: event.target.value }
                                        : currentCommand,
                                    ),
                                  }))
                                }
                                placeholder="help"
                                className="w-full bg-transparent px-2 py-3 text-sm outline-none"
                              />
                            </div>
                            <p className="mt-2 text-xs text-gray-500">
                              Spaces and special characters are cleaned automatically on save.
                            </p>
                          </label>
                          <label className="block">
                            <span className="mb-2 block text-sm font-medium text-gray-700">
                              Description
                            </span>
                            <input
                              type="text"
                              value={command.commandDescription}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  commands: current.commands.map((currentCommand) =>
                                    currentCommand.id === command.id
                                      ? {
                                          ...currentCommand,
                                          commandDescription: event.target.value,
                                        }
                                      : currentCommand,
                                  ),
                                }))
                              }
                              placeholder="Show support options"
                              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                            />
                          </label>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-gray-200 bg-gray-50 px-5 py-8 text-center">
                      <p className="text-sm text-gray-600">
                        No bot commands yet. Add the shortcuts you want customers to use.
                      </p>
                    </div>
                  )}
                </div>
              </SectionCard>
            </div>

            <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
              <section className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Live preview</h2>
                    <p className="mt-1 text-sm text-gray-500">What customers see in WhatsApp.</p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-gray-600">
                    Preview
                  </div>
                </div>

                <div className="mx-auto mt-5 w-full max-w-[320px] rounded-[2.4rem] bg-white p-3 shadow-[0_20px_60px_rgba(15,23,42,0.14)]">
                  <div className="rounded-[2rem] border border-gray-100 bg-[#efeae2] p-3">
                    <div className="flex items-center gap-3 rounded-[1.6rem] bg-[#f7f7f5] px-4 py-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366]/15 text-[#25D366]">
                        <Bot className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">Automation</p>
                        <p className="truncate text-xs text-gray-500">
                          {channel.displayPhoneNumber || channel.phoneNumberId}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {form.enableWelcomeMessage ? (
                        <div className="max-w-[88%] rounded-[1.4rem] rounded-tl-md bg-white px-4 py-3 text-sm leading-6 text-gray-700 shadow-sm">
                          Welcome message is active for new conversations.
                        </div>
                      ) : null}

                      <div className="rounded-[1.4rem] bg-white px-4 py-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                          Conversation prompts
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {previewPrompts.length ? (
                            previewPrompts.map((prompt) => (
                              <span
                                key={prompt}
                                className="rounded-full border border-[#cfe0ff] bg-[#eef4ff] px-3 py-2 text-sm font-medium text-[#1f4ed8]"
                              >
                                {prompt}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-gray-500">No prompts added yet.</span>
                          )}
                        </div>
                      </div>

                      <div className="rounded-[1.4rem] bg-white px-4 py-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                          Bot commands
                        </p>
                        <div className="mt-3 space-y-3">
                          {previewCommands.length ? (
                            previewCommands.map((command) => (
                              <div
                                key={command.commandName}
                                className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3"
                              >
                                <p className="text-sm font-semibold text-[#5b45ff]">
                                  /{command.commandName}
                                </p>
                                <p className="mt-1 text-sm leading-6 text-gray-600">
                                  {command.commandDescription}
                                </p>
                              </div>
                            ))
                          ) : (
                            <span className="text-sm text-gray-500">No commands added yet.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Sync status</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      The latest publish result for this WhatsApp number.
                    </p>
                  </div>
                  <div className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] ${syncSummary.tone}`}>
                    {syncSummary.label}
                  </div>
                </div>

                <dl className="mt-5 space-y-4 text-sm">
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <dt className="text-gray-500">Last synced</dt>
                    <dd className="mt-1 font-medium text-gray-900">
                      {formatDateTime(config?.lastSyncedAt || null)}
                    </dd>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <dt className="text-gray-500">Phone number</dt>
                    <dd className="mt-1 font-medium text-gray-900">
                      {channel.displayPhoneNumber || channel.phoneNumberId}
                    </dd>
                  </div>
                  {config?.lastError ? (
                    <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-red-700">
                      <dt className="font-medium">Last issue</dt>
                      <dd className="mt-1 leading-6">{config.lastError}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
