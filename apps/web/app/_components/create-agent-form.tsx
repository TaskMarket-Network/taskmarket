'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { buildCreateAgentInput, type CreateAgentForm } from '../../lib/validate';

const EMPTY: CreateAgentForm = {
  name: '',
  description: '',
  capabilities: '',
  endpoints: '',
  status: 'draft',
  currency: '',
  minAmount: '',
  maxAmount: '',
  pricingDescription: '',
};

export function CreateAgentForm() {
  const router = useRouter();
  const [form, setForm] = useState<CreateAgentForm>(EMPTY);
  const [issues, setIssues] = useState<readonly string[]>([]);
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; message: string }>(
    {
      kind: 'idle',
      message: '',
    },
  );

  function setField<Key extends keyof CreateAgentForm>(key: Key, value: CreateAgentForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = buildCreateAgentInput(form);
    setIssues(parsed.issues);
    if (parsed.input === null) {
      setStatus({ kind: 'error', message: 'Please fix the highlighted issues.' });
      return;
    }
    setStatus({ kind: 'busy', message: 'Registering agent…' });
    const response = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const body = (await response.json().catch(() => null)) as
      | { ok: true; agent: { id: string; name: string } }
      | { ok: false; error: { message: string; issues?: readonly string[] } }
      | null;
    if (!response.ok || body === null || !body.ok) {
      const error = body?.ok === false ? body.error : null;
      setStatus({
        kind: 'error',
        message: error?.message ?? 'Registration failed. Is the database reachable?',
      });
      setIssues(error?.issues ?? []);
      return;
    }
    setIssues([]);
    setForm(EMPTY);
    setStatus({ kind: 'ok', message: `Registered "${body.agent.name}".` });
    router.refresh();
  }

  return (
    <section className="card">
      <h2>Register a new agent</h2>
      <p className="meta">
        Fields are validated locally and again by the registration service at the boundary.
      </p>
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="create-name">
            Name <span aria-hidden="true">*</span>
          </label>
          <input
            id="create-name"
            name="name"
            required
            type="text"
            value={form.name}
            onChange={(event) => setField('name', event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="create-description">Description</label>
          <textarea
            id="create-description"
            name="description"
            value={form.description}
            onChange={(event) => setField('description', event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="create-capabilities">
            Capabilities <span aria-hidden="true">*</span>
          </label>
          <input
            id="create-capabilities"
            name="capabilities"
            required
            type="text"
            value={form.capabilities}
            onChange={(event) => setField('capabilities', event.target.value)}
            placeholder="agent:meta, wallet:read"
            autoComplete="off"
          />
          <span className="hint">
            Comma-separated keys that look like &quot;agent:meta&quot; (1–100).
          </span>
        </div>
        <div className="field">
          <label htmlFor="create-endpoints">Endpoints</label>
          <textarea
            id="create-endpoints"
            name="endpoints"
            value={form.endpoints}
            onChange={(event) => setField('endpoints', event.target.value)}
            placeholder={'mcp https://example.com/mcp\nhttps://example.com/webhook'}
          />
          <span className="hint">
            One per line as &quot;type url&quot; (mcp, http, webhook) or just &quot;url&quot; for
            http.
          </span>
        </div>
        <div className="field">
          <label htmlFor="create-status">Initial registration state</label>
          <select
            id="create-status"
            name="status"
            value={form.status}
            onChange={(event) =>
              setField('status', event.target.value as CreateAgentForm['status'])
            }
          >
            <option value="draft">Draft (not discoverable)</option>
            <option value="active">Active (discoverable)</option>
          </select>
        </div>
        <fieldset>
          <legend>Pricing (informational)</legend>
          <div className="field">
            <label htmlFor="create-currency">Currency</label>
            <input
              id="create-currency"
              name="currency"
              type="text"
              value={form.currency}
              onChange={(event) => setField('currency', event.target.value)}
              placeholder="USDC"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="create-min">Minimum amount</label>
            <input
              id="create-min"
              name="minAmount"
              type="text"
              inputMode="decimal"
              value={form.minAmount}
              onChange={(event) => setField('minAmount', event.target.value)}
              placeholder="0.01"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="create-max">Maximum amount</label>
            <input
              id="create-max"
              name="maxAmount"
              type="text"
              inputMode="decimal"
              value={form.maxAmount}
              onChange={(event) => setField('maxAmount', event.target.value)}
              placeholder="10"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="create-pricing-note">Pricing note</label>
            <input
              id="create-pricing-note"
              name="pricingDescription"
              type="text"
              value={form.pricingDescription}
              onChange={(event) => setField('pricingDescription', event.target.value)}
              placeholder="per trade"
              autoComplete="off"
            />
          </div>
          <span className="hint">Metadata for discovery/matching only — no payment behavior.</span>
        </fieldset>
        {issues.length > 0 ? (
          <ul className="issues" aria-live="polite">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={status.kind === 'busy'}>
            {status.kind === 'busy' ? 'Registering…' : 'Register agent'}
          </button>
        </div>
        {status.kind !== 'idle' ? (
          <p
            className={`status status-${status.kind === 'ok' ? 'success' : 'error'}`}
            aria-live="polite"
          >
            {status.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
