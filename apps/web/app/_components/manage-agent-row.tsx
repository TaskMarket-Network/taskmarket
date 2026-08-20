'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { formatDate, type DisplayAgent } from '../../lib/display';
import { buildUpdateInput, type EditAgentForm } from '../../lib/validate';

interface ActionStatus {
  readonly kind: 'idle' | 'busy' | 'ok' | 'error';
  readonly message: string;
}

export function ManageAgentRow({ agent }: { readonly agent: DisplayAgent }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditAgentForm>({
    name: agent.name,
    description: agent.description,
    capabilities: agent.capabilities.join(', '),
    endpoints: agent.endpoints.map((endpoint) => `${endpoint.type} ${endpoint.url}`).join('\n'),
  });
  const [issues, setIssues] = useState<readonly string[]>([]);
  const [actionStatus, setActionStatus] = useState<ActionStatus>({ kind: 'idle', message: '' });

  function setField<Key extends keyof EditAgentForm>(key: Key, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function run(request: () => Promise<Response>, successMessage: string) {
    setActionStatus({ kind: 'busy', message: 'Working…' });
    const response = await request();
    const body = (await response.json().catch(() => null)) as
      { ok: true } | { ok: false; error: { message: string; issues?: readonly string[] } } | null;
    if (!response.ok || body === null || !body.ok) {
      const error = body?.ok === false ? body.error : null;
      setActionStatus({
        kind: 'error',
        message: error?.message ?? 'Operation failed. Is the database reachable?',
      });
      setIssues(error?.issues ?? []);
      return;
    }
    setIssues([]);
    setEditing(false);
    setActionStatus({ kind: 'ok', message: successMessage });
    router.refresh();
  }

  function onSubmitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = buildUpdateInput(form);
    setIssues(parsed.issues);
    if (parsed.update === null) {
      setActionStatus({ kind: 'error', message: 'Please fix the highlighted issues.' });
      return;
    }
    void run(
      () =>
        fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: agent.version, form }),
        }),
      'Saved changes.',
    );
  }

  function onActivate() {
    void run(
      () =>
        fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: agent.version, form: { status: 'active' } }),
        }),
      'Agent is now active and discoverable.',
    );
  }

  function onDisable() {
    void run(
      () =>
        fetch(`/api/agents/${encodeURIComponent(agent.id)}/disable`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: agent.version }),
        }),
      'Agent retired.',
    );
  }

  const tone = agent.statusTone;
  return (
    <li className="card manage-row">
      <div className="row-top">
        <h3>
          <Link href={`/agents/${encodeURIComponent(agent.id)}`}>{agent.name}</Link>
        </h3>
        <span className={`badge badge-${tone}`}>{agent.statusLabel}</span>
        <span className="meta">
          v{agent.version} · updated {formatDate(agent.updatedAt)}
        </span>
      </div>

      <div className="actions">
        <Link className="btn btn-sm" href={`/agents/${encodeURIComponent(agent.id)}`}>
          View profile
        </Link>
        {agent.status !== 'active' ? (
          <button
            className="btn btn-sm"
            type="button"
            onClick={onActivate}
            disabled={actionStatus.kind === 'busy'}
          >
            Activate
          </button>
        ) : null}
        {agent.status !== 'retired' ? (
          <button
            className="btn btn-sm btn-danger"
            type="button"
            onClick={onDisable}
            disabled={actionStatus.kind === 'busy'}
          >
            Disable
          </button>
        ) : null}
        <button className="btn btn-sm" type="button" onClick={() => setEditing((value) => !value)}>
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {editing ? (
        <form onSubmit={onSubmitEdit} noValidate>
          <div className="field">
            <label htmlFor={`edit-name-${agent.id}`}>Name</label>
            <input
              id={`edit-name-${agent.id}`}
              name="name"
              type="text"
              value={form.name}
              onChange={(event) => setField('name', event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`edit-description-${agent.id}`}>Description</label>
            <textarea
              id={`edit-description-${agent.id}`}
              name="description"
              value={form.description}
              onChange={(event) => setField('description', event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`edit-capabilities-${agent.id}`}>Capabilities</label>
            <input
              id={`edit-capabilities-${agent.id}`}
              name="capabilities"
              type="text"
              value={form.capabilities}
              onChange={(event) => setField('capabilities', event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`edit-endpoints-${agent.id}`}>Endpoints</label>
            <textarea
              id={`edit-endpoints-${agent.id}`}
              name="endpoints"
              value={form.endpoints}
              onChange={(event) => setField('endpoints', event.target.value)}
            />
          </div>
          {issues.length > 0 ? (
            <ul className="issues" aria-live="polite">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
          <button
            className="btn btn-primary btn-sm"
            type="submit"
            disabled={actionStatus.kind === 'busy'}
          >
            Save changes
          </button>
        </form>
      ) : null}

      {actionStatus.kind !== 'idle' ? (
        <p
          className={`status status-${actionStatus.kind === 'ok' ? 'success' : 'error'}`}
          aria-live="polite"
        >
          {actionStatus.message}
        </p>
      ) : null}
    </li>
  );
}
