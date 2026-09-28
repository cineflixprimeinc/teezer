'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Ban, Check, ChevronDown, ChevronRight, Clock, Copy,
  Download, Globe, History, KeyRound, PauseCircle, PlayCircle, Plus, RotateCcw,
  Search, Server, ShieldCheck, Ticket,
} from 'lucide-react';
import {
  listLicenses, listPurchaseCodes, generatePurchaseCodes, disablePurchaseCode,
  suspendLicense, reactivateLicense, revokeLicense, resetActivation, changeDomain,
  getLicense,
  type License, type LicenseStats, type PurchaseCodeRow,
  type LicenseActivationRow, type LicenseAuditRow,
} from '@/services/license.service';
import { apiMessage } from '@/services/api';
import { Card, CardBody, CardHeader, CardTitle, StatCard } from '@/admin-panel/components/ui/card';
import { Button } from '@/admin-panel/components/ui/button';
import { Badge } from '@/admin-panel/components/ui/badge';
import { Input, Select, Textarea } from '@/admin-panel/components/ui/input';
import { ConfirmModal } from '@/admin-panel/components/ui/confirm-modal';
import {
  Table, Thead, Tbody, Th, Td, Tr, Pagination, TableEmpty,
} from '@/admin-panel/components/ui/data-table';

/**
 * "Teezer Code Purchase" - marketplace licence and purchase-code management.
 *
 * Built from the admin panel's own UI kit (Card/Button/Badge/Table/ConfirmModal)
 * rather than hand-rolled styles. The first version of this component was
 * written for the route group's old dark layout and, once the panel moved to
 * teezer.live/admin and became light, rendered as an unreadable dark island -
 * invisible table headers, white-on-white tabs. Using the kit means it now
 * inherits the panel's look automatically and cannot drift again.
 *
 * Everything here is MASKED and that is not a UI choice: purchase codes and
 * licence keys exist only as SHA-256 hashes, so the unmasked values are not
 * available to display. See AdminLicenseController for why there is no
 * "reveal".
 *
 * Access is enforced server-side (api.admin + permission:manage_licenses).
 * Nothing in this file is a security control.
 */

type Tab = 'licenses' | 'codes';

export default function LicenseManager() {
  const [tab, setTab] = useState<Tab>('licenses');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1 border-b border-[#e8eaed]">
        <TabButton active={tab === 'licenses'} onClick={() => setTab('licenses')} icon={KeyRound}>
          Licences
        </TabButton>
        <TabButton active={tab === 'codes'} onClick={() => setTab('codes')} icon={Ticket}>
          Purchase codes
        </TabButton>
      </div>

      {tab === 'licenses' ? <LicensesTab /> : <PurchaseCodesTab />}
    </div>
  );
}

/* ── Licences ───────────────────────────────────────────────────────────── */

type PendingAction =
  | { kind: 'suspend'; license: License }
  | { kind: 'reactivate'; license: License }
  | { kind: 'revoke'; license: License }
  | { kind: 'reset'; license: License }
  | { kind: 'domain'; license: License }
  | null;

function LicensesTab() {
  const [rows, setRows] = useState<License[]>([]);
  const [stats, setStats] = useState<LicenseStats | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [working, setWorking] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Captured when data arrives, so every relative time on screen is measured
  // from the same instant rather than each row calling Date.now() mid-render.
  const [loadedAt, setLoadedAt] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listLicenses({ q: q || undefined, status, page, per_page: 25 });
      setRows(data.items);
      setStats(data.stats);
      setLastPage(data.meta.last_page);
      setTotal(data.meta.total);
      setLoadedAt(Date.now());
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setLoading(false);
    }
  }, [q, status, page]);

  useEffect(() => {
    // Debounced: the server hashes the search term to match a pasted code, so
    // firing per keystroke would hash 20 times a second for no benefit.
    const t = window.setTimeout(load, q ? 350 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);

  function openAction(kind: NonNullable<PendingAction>['kind'], license: License) {
    setReason('');
    setFormError(null);
    setNewDomain(license.domain);
    setPending({ kind, license } as PendingAction);
  }

  async function runAction() {
    if (!pending) return;

    // Validated here rather than by disabling the confirm button. ConfirmModal's
    // `loading` prop disables BOTH buttons and relabels confirm to "Processing…",
    // so using it to express "reason is required" would tell the operator work
    // was happening when none was, and trap them with Cancel disabled too.
    if (pending.kind === 'revoke' && reason.trim() === '') {
      setFormError('A reason is required to revoke a licence.');
      return;
    }
    if (pending.kind === 'domain' && newDomain.trim() === '') {
      setFormError('Enter the new domain.');
      return;
    }

    setFormError(null);
    setWorking(true);
    setError(null);

    const id = pending.license.license_id;

    try {
      if (pending.kind === 'suspend')    await suspendLicense(id, reason.trim() || undefined);
      if (pending.kind === 'reactivate') await reactivateLicense(id);
      if (pending.kind === 'revoke')     await revokeLicense(id, reason.trim());
      if (pending.kind === 'reset')      await resetActivation(id, reason.trim() || undefined);
      if (pending.kind === 'domain')     await changeDomain(id, newDomain.trim(), reason.trim() || undefined);
      setPending(null);
      await load();
    } catch (err) {
      setError(apiMessage(err));
      setPending(null);
    } finally {
      setWorking(false);
    }
  }

  const actionCopy = useMemo(() => {
    if (!pending) return null;
    const d = pending.license.domain;
    switch (pending.kind) {
      case 'suspend':
        return { title: 'Suspend this licence?', message: `${d} will stop verifying at its next heartbeat. No data is touched and you can reactivate at any time.`, confirm: 'Suspend', danger: false };
      case 'reactivate':
        return { title: 'Reactivate this licence?', message: `${d} will start verifying again at its next heartbeat.`, confirm: 'Reactivate', danger: false };
      case 'revoke':
        return { title: 'Revoke this licence?', message: `${d} will stop working permanently. This cannot be undone - a revoked licence cannot be reactivated, only replaced with a new purchase code. The customer's data is never touched.`, confirm: 'Revoke permanently', danger: true };
      case 'reset':
        return { title: 'Reset the activation?', message: `Clears the installation binding for ${d} so the customer can install on a new server. The previous activation is kept in history, not deleted.`, confirm: 'Reset activation', danger: false };
      case 'domain':
        return { title: 'Move this licence to a new domain', message: `The existing signed token names ${d}, so it stops verifying immediately. The customer must re-run the installer on the new domain.`, confirm: 'Change domain', danger: false };
    }
  }, [pending]);

  return (
    <div className="flex flex-col gap-5">
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total licences" value={stats.total} icon={KeyRound} color="#6366f1" />
          <StatCard label="Active" value={stats.active} icon={ShieldCheck} color="#10b981" />
          <StatCard label="Installed" value={stats.installed} icon={Server} color="#3b82f6"
            sub={stats.total ? `${Math.round((stats.installed / stats.total) * 100)}% of licences` : undefined} />
          <StatCard label="Suspended" value={stats.suspended} icon={PauseCircle} color="#f59e0b" />
          <StatCard label="Revoked" value={stats.revoked} icon={Ban} color="#ef4444" />
          <StatCard label="Codes left" value={stats.codes_available} icon={Ticket} color="#8b5cf6" />
        </div>
      )}

      {/* Quiet installs is the number an operator actually acts on, so it gets
          a sentence rather than another tile competing with the rest. */}
      {stats && stats.quiet_installs > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-[13px] text-amber-800">
            <strong>{stats.quiet_installs}</strong>{' '}
            {stats.quiet_installs === 1 ? 'installation has' : 'installations have'} not checked in for
            over 14 days. That usually means the scheduler stopped, not that anything is wrong with the licence.
          </p>
        </div>
      )}

      {error && <ErrorBar message={error} onDismiss={() => setError(null)} />}

      <Card>
        <CardHeader className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" />
            <Input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Search domain, username, licence ID, installation ID — or paste a purchase code"
              className="pl-9"
            />
          </div>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="revoked">Revoked</option>
            <option value="expired">Expired</option>
          </Select>
        </CardHeader>

        <Table>
          <Thead>
            <Th className="w-8"><span className="sr-only">Expand row</span></Th>
            <Th>Domain</Th>
            <Th>Owner</Th>
            <Th>Purchase code</Th>
            <Th>Licence key</Th>
            <Th>Installation</Th>
            <Th>Status</Th>
            <Th>Version</Th>
            <Th>Last verified</Th>
            <Th className="text-right">Actions</Th>
          </Thead>
          <Tbody>
            {loading && rows.length === 0 && <TableEmpty message="Loading licences…" />}

            {!loading && rows.length === 0 && (
              <TableEmpty
                message={
                  q || status !== 'all'
                    ? 'No licences match these filters.'
                    : 'No licences yet. Generate purchase codes, then customers activate them at teezer.live/activate-license.'
                }
              />
            )}

            {rows.map((row) => (
              <LicenseRow
                key={row.license_id}
                row={row}
                expanded={expanded === row.license_id}
                onToggle={() => setExpanded(expanded === row.license_id ? null : row.license_id)}
                onAction={openAction}
                now={loadedAt}
              />
            ))}
          </Tbody>
        </Table>

        <Pagination currentPage={page} lastPage={lastPage} total={total} onPage={setPage} />
      </Card>

      <ConfirmModal
        open={!!pending}
        title={actionCopy?.title ?? ''}
        message={actionCopy?.message ?? ''}
        confirmLabel={actionCopy?.confirm ?? 'Confirm'}
        danger={actionCopy?.danger}
        loading={working}
        onConfirm={runAction}
        onCancel={() => setPending(null)}
      >
        {pending?.kind === 'domain' && (
          <label className="mt-4 block">
            <span className="text-[12px] font-semibold text-[#374151]">New domain</span>
            <Input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="example.com"
              className="mt-1.5"
            />
          </label>
        )}

        {pending && pending.kind !== 'reactivate' && (
          <label className="mt-4 block">
            <span className="text-[12px] font-semibold text-[#374151]">
              Reason {pending.kind === 'revoke' ? '(required)' : '(optional)'}
            </span>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={pending.kind === 'revoke' ? 'Chargeback, licence resold, terms breach…' : 'Recorded in the licence history'}
              className="mt-1.5"
            />
          </label>
        )}

        {formError && (
          <p role="alert" className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-red-600">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {formError}
          </p>
        )}
      </ConfirmModal>
    </div>
  );
}

function LicenseRow({
  row, expanded, onToggle, onAction, now,
}: {
  row: License;
  expanded: boolean;
  onToggle: () => void;
  onAction: (kind: NonNullable<PendingAction>['kind'], license: License) => void;
  now: number;
}) {
  const [detail, setDetail] = useState<{
    activations: LicenseActivationRow[];
    audit_logs: LicenseAuditRow[];
  } | null>(null);

  useEffect(() => {
    if (!expanded || detail) return;
    let cancelled = false;

    getLicense(row.license_id)
      .then((d) => { if (!cancelled) setDetail({ activations: d.activations, audit_logs: d.audit_logs }); })
      .catch(() => { if (!cancelled) setDetail({ activations: [], audit_logs: [] }); });

    return () => { cancelled = true; };
  }, [expanded, detail, row.license_id]);

  const revoked = row.status === 'revoked';

  return (
    <>
      <Tr className={expanded ? 'bg-[#f9fafb]' : undefined}>
        <Td>
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className="grid h-6 w-6 place-items-center rounded-md text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#111827]"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </Td>

        <Td>
          <div className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
            <span className="font-semibold text-[#111827]">{row.domain}</span>
            <CopyButton value={row.domain} label="domain" />
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-[#9ca3af]">{row.license_id}</p>
        </Td>

        <Td>{row.username}</Td>
        <Td className="font-mono text-[12px] text-[#6b7280]">{row.purchase_code}</Td>
        <Td className="font-mono text-[12px] text-[#6b7280]">{row.license_key}</Td>

        <Td>
          {row.installation_id ? (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[11px]">{row.installation_id.slice(0, 18)}…</span>
              <CopyButton value={row.installation_id} label="installation ID" />
            </div>
          ) : (
            <Badge variant="outline">Not installed</Badge>
          )}
        </Td>

        <Td><LicenseStatusBadge status={row.status} /></Td>
        <Td>{row.version ?? <span className="text-[#c3c7d1]">—</span>}</Td>
        <Td><RelativeTime value={row.last_verified_at} now={now} /></Td>

        <Td className="text-right">
          <div className="flex flex-wrap justify-end gap-1">
            {row.status === 'active' && (
              <Button variant="warning" size="sm" onClick={() => onAction('suspend', row)}>
                <PauseCircle className="h-3.5 w-3.5" /> Suspend
              </Button>
            )}
            {row.status === 'suspended' && (
              <Button variant="success" size="sm" onClick={() => onAction('reactivate', row)}>
                <PlayCircle className="h-3.5 w-3.5" /> Reactivate
              </Button>
            )}
            {row.installation_id && !revoked && (
              <Button variant="outline" size="sm" onClick={() => onAction('reset', row)} title="Let the customer install on a new server">
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
            )}
            {!revoked && (
              <>
                <Button variant="outline" size="sm" onClick={() => onAction('domain', row)}>
                  <Globe className="h-3.5 w-3.5" /> Domain
                </Button>
                <Button variant="danger" size="sm" onClick={() => onAction('revoke', row)}>
                  <Ban className="h-3.5 w-3.5" /> Revoke
                </Button>
              </>
            )}
          </div>
        </Td>
      </Tr>

      {expanded && (
        <tr>
          <td colSpan={10} className="border-b border-[#f3f4f6] bg-[#f9fafb] px-4 py-5">
            {!detail ? (
              <p className="text-[13px] text-[#9ca3af]">Loading history…</p>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                <DetailPanel icon={Server} title="Installations" count={detail.activations.length}>
                  {detail.activations.length === 0 ? (
                    <Empty>Never installed.</Empty>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {detail.activations.map((a, i) => (
                        <li key={`${a.installation_id}-${i}`} className="rounded-xl border border-[#e8eaed] bg-white p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <code className="font-mono text-[11px] text-[#374151]">{a.installation_id}</code>
                            <Badge variant={a.status === 'active' ? 'success' : a.status === 'rejected' ? 'danger' : 'default'}>
                              {a.status}
                            </Badge>
                          </div>
                          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-4">
                            <Meta label="Domain" value={a.domain} />
                            <Meta label="Version" value={a.version} />
                            <Meta label="PHP" value={a.php_version} />
                            <Meta label="Server IP" value={a.ip_address} />
                            <Meta label="OS" value={a.server_os} className="col-span-2" />
                            <Meta label="Last seen" value={a.last_seen_at ? relative(a.last_seen_at, now) : null} />
                            <Meta label="Activated" value={a.activated_at ? relative(a.activated_at, now) : null} />
                          </dl>
                          {a.rejection_reason && (
                            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-red-600">
                              <AlertTriangle className="h-3 w-3 shrink-0" /> Rejected: {a.rejection_reason}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </DetailPanel>

                <DetailPanel icon={History} title="History" count={detail.audit_logs.length}>
                  {detail.audit_logs.length === 0 ? (
                    <Empty>No events recorded.</Empty>
                  ) : (
                    <ol className="max-h-80 space-y-0 overflow-y-auto rounded-xl border border-[#e8eaed] bg-white">
                      {detail.audit_logs.map((log, i) => (
                        <li key={i} className="flex gap-3 border-b border-[#f3f4f6] px-3 py-2 last:border-0">
                          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                            log.severity === 'critical' ? 'bg-red-500'
                              : log.severity === 'warning' ? 'bg-amber-500' : 'bg-[#d1d5db]'
                          }`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] text-[#374151]">
                              <span className="font-semibold text-[#111827]">{log.action}</span>
                              {log.description ? ` — ${log.description}` : ''}
                            </p>
                            <p className="mt-0.5 text-[11px] text-[#9ca3af]">
                              {log.actor_type}
                              {log.ip_address ? ` · ${log.ip_address}` : ''}
                              {log.created_at ? ` · ${relative(log.created_at, now)}` : ''}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </DetailPanel>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Purchase codes ─────────────────────────────────────────────────────── */

function PurchaseCodesTab() {
  const [rows, setRows] = useState<PurchaseCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(10);
  const [batch, setBatch] = useState('');
  const [limit, setLimit] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<{ batch: string; codes: string[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const [toDisable, setToDisable] = useState<PurchaseCodeRow | null>(null);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPurchaseCodes({});
      setRows(data.items);
      setLoadedAt(Date.now());
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const data = await generatePurchaseCodes({
        count,
        batch: batch.trim() || undefined,
        activation_limit: limit,
      });
      setGenerated({ batch: data.batch, codes: data.codes });
      await load();
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  function download() {
    if (!generated) return;
    const url = URL.createObjectURL(new Blob([generated.codes.join('\n') + '\n'], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `teezer-purchase-codes-${generated.batch}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyAll() {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.codes.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch { /* clipboard may be refused; the textarea is selectable */ }
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <ErrorBar message={error} onDismiss={() => setError(null)} />}

      <Card>
        <CardHeader>
          <CardTitle>Generate purchase codes</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <p className="text-[13px] text-[#6b7280]">
            Codes are returned <strong>once</strong> and stored only as hashes. Download them before
            leaving this screen — they cannot be shown again.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-[#374151]">How many</span>
              <Input
                type="number" min={1} max={500} value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                className="w-28"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-[#374151]">Batch label</span>
              <Input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="codecanyon-jan" className="w-56" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-[#374151]">Domains per code</span>
              <Input
                type="number" min={1} max={50} value={limit}
                onChange={(e) => setLimit(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className="w-32"
              />
            </label>
            <Button onClick={generate} disabled={generating}>
              <Plus className="h-3.5 w-3.5" />
              {generating ? 'Generating…' : `Generate ${count}`}
            </Button>
          </div>

          {generated && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-[13px] font-bold text-amber-800">
                  <AlertTriangle className="h-4 w-4" />
                  {generated.codes.length} codes generated in “{generated.batch}” — shown once
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copyAll}>
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy all'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={download}>
                    <Download className="h-3.5 w-3.5" /> Download .txt
                  </Button>
                </div>
              </div>
              <textarea
                readOnly
                value={generated.codes.join('\n')}
                rows={Math.min(10, generated.codes.length)}
                className="mt-3 w-full resize-y rounded-[10px] border border-amber-200 bg-white px-3 py-2 font-mono text-[12px] text-[#111827]"
              />
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>All purchase codes</CardTitle></CardHeader>
        <Table>
          <Thead>
            <Th>Code</Th>
            <Th>Batch</Th>
            <Th>Status</Th>
            <Th>Licences issued</Th>
            <Th>Domain limit</Th>
            <Th>Created</Th>
            <Th className="text-right">Actions</Th>
          </Thead>
          <Tbody>
            {loading && <TableEmpty message="Loading purchase codes…" />}
            {!loading && rows.length === 0 && (
              <TableEmpty message="No purchase codes yet. Generate a batch above to start selling." />
            )}
            {rows.map((row) => (
              <Tr key={row.id}>
                <Td className="font-mono text-[12px] text-[#374151]">{row.masked}</Td>
                <Td>{row.batch ?? <span className="text-[#c3c7d1]">—</span>}</Td>
                <Td>
                  <Badge variant={
                    row.status === 'available' ? 'success'
                      : row.status === 'activated' ? 'info' : 'danger'
                  }>
                    {row.status}
                  </Badge>
                </Td>
                <Td>
                  <span className="font-semibold text-[#111827]">{row.licenses_count}</span>
                  <span className="text-[#9ca3af]"> / {row.activation_limit}</span>
                </Td>
                <Td>{row.activation_limit}</Td>
                <Td><RelativeTime value={row.created_at} now={loadedAt} /></Td>
                <Td className="text-right">
                  {row.status !== 'disabled' && (
                    <Button variant="danger" size="sm" onClick={() => setToDisable(row)}>
                      <Ban className="h-3.5 w-3.5" /> Disable
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Card>

      <ConfirmModal
        open={!!toDisable}
        title="Disable this purchase code?"
        message={`${toDisable?.masked ?? ''} can no longer be redeemed. Licences already issued from it keep working.`}
        confirmLabel="Disable code"
        danger
        onConfirm={async () => {
          if (!toDisable) return;
          try {
            await disablePurchaseCode(toDisable.id);
            setToDisable(null);
            await load();
          } catch (err) {
            setError(apiMessage(err));
            setToDisable(null);
          }
        }}
        onCancel={() => setToDisable(null)}
      />
    </div>
  );
}

/* ── Small shared pieces ────────────────────────────────────────────────── */

function TabButton({
  active, onClick, icon: Icon, children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-[13px] font-semibold transition-colors',
        active
          ? 'border-[#fd4605] text-[#fd4605]'
          : 'border-transparent text-[#6b7280] hover:text-[#111827]',
      ].join(' ')}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

/**
 * Licence statuses do not map onto the shared StatusBadge: it has no entry for
 * "suspended" or "revoked" and would render both as neutral grey, which is
 * exactly wrong for the two states an operator needs to spot instantly.
 */
function LicenseStatusBadge({ status }: { status: string }) {
  const variant =
    status === 'active' ? 'success'
      : status === 'suspended' ? 'warning'
      : status === 'revoked' ? 'danger'
      : 'default';

  return <Badge variant={variant} className="capitalize">{status}</Badge>;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          window.setTimeout(() => setDone(false), 1800);
        } catch { /* clipboard may be refused; value is selectable on screen */ }
      }}
      className="shrink-0 rounded p-0.5 text-[#c3c7d1] transition-colors hover:text-[#111827]"
    >
      {done ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function DetailPanel({
  icon: Icon, title, count, children,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
        <Icon className="h-3.5 w-3.5" />
        {title}
        <span className="rounded-full bg-[#e8eaed] px-1.5 text-[10px] text-[#374151]">{count}</span>
      </p>
      {children}
    </div>
  );
}

function Meta({ label, value, className }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[10px] uppercase tracking-wide text-[#9ca3af]">{label}</dt>
      <dd className="truncate text-[12px] text-[#374151]">{value || '—'}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-[#e8eaed] bg-white px-3 py-6 text-center text-[12px] text-[#9ca3af]">
      {children}
    </p>
  );
}

function ErrorBar({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
      <p className="flex items-start gap-2 text-[13px] text-red-700">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        {message}
      </p>
      <button type="button" onClick={onDismiss} className="shrink-0 text-[12px] font-semibold text-red-600 hover:text-red-800">
        Dismiss
      </button>
    </div>
  );
}

function RelativeTime({ value, now }: { value: string | null; now: number }) {
  if (!value) return <span className="text-[#c3c7d1]">Never</span>;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span className="text-[#c3c7d1]">—</span>;

  // `now` is the moment the data was fetched, threaded down from the tab,
  // rather than Date.now() called here. Calling it during render is impure -
  // React's lint flags it - and it also lies slightly: every row would time
  // itself against a different instant. Anchoring to the load makes "3d ago"
  // mean three days before the data you are actually looking at.
  const stale = now - date.getTime() > 14 * 86_400_000;

  return (
    <span title={date.toLocaleString()} className={stale ? 'text-amber-600' : undefined}>
      {relative(value, now)}
    </span>
  );
}

function relative(value: string, now: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const mins = Math.floor((now - date.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;

  const days = Math.floor(mins / 1440);
  if (days < 30) return `${days}d ago`;

  return date.toLocaleDateString();
}
