// Settings — system_admin only. Five tabs:
//   Accounts        create login-ready accounts (admin_create_account_with_password),
//                   appoint further roles (admin_grant_membership), list via
//                   list_provisioned_accounts.
//   Store products  full product CRUD + image upload to the store-products bucket
//                   (direct table access under sysadmin RLS).
//   Parameters      app_settings (numeric config values - the Appendix F mirror).
//   Flags           app_flags (feature toggles, e.g. store_enabled).
//   System          build version (version.json), environment.
//
// Dense-table house style per Accounts.tsx. Route: /admin/settings,
// RequireRole ['system_admin'] (App.tsx); every write is additionally
// gated server-side (RLS / definer RPC checks) - the UI is never the guard.
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

type Load = 'loading' | 'ready' | 'error';
type Tab = 'accounts' | 'products' | 'params' | 'flags' | 'contacts' | 'system';

const CSS = `
.mas-page.mas-page-wide { max-width: none !important; width: auto !important; margin-left: 0 !important; margin-right: 0 !important; }
.mas-tight th, .mas-tight td { padding: 0.35rem 0.6rem; white-space: nowrap; vertical-align: middle; }
.mas-tight tbody tr { line-height: 1.3; }
.mas-tight .mas-link { color: var(--mas-navy, #1E2752); text-decoration: underline; cursor: pointer; background: none; border: none; padding: 0; font: inherit; }
.mas-tight .mas-link:hover { text-decoration: none; }
.mas-tight .mas-link + .mas-link { margin-left: 0.6rem; }
.mas-set-form { display: flex; gap: 0.5rem; align-items: end; flex-wrap: wrap; }
.mas-set-form label { display: flex; flex-direction: column; font-size: 0.8rem; color: var(--mas-muted, #5b6472); }
.mas-set-form input, .mas-set-form select, .mas-set-form textarea {
  font: inherit; padding: 0.35rem 0.5rem; border: 1px solid var(--mas-line, #e3e9f3); border-radius: 6px;
}
.mas-set-thumbs { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 0.5rem 0; }
.mas-set-thumb { border: 1px solid var(--mas-line, #e3e9f3); border-radius: 6px; padding: 0.3rem; text-align: center; }
.mas-set-thumb img { width: 84px; height: 84px; object-fit: cover; display: block; border-radius: 4px; }
.mas-set-thumb .mas-link { font-size: 0.75rem; }
.mas-set-primary { outline: 2px solid var(--mas-gold, #F9C610); }
`;

function money(n: number | string | null | undefined): string {
  return `RM ${Number(n ?? 0).toFixed(2)}`;
}
function prettyDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function pretty(s: string | null): string {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

// ============================================================ Accounts
interface ProvisionedAccount {
  profile_id: string;
  email: string;
  full_name: string | null;
  roles: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  status: string | null;
  username?: string | null;
}

// Streamlined role list per Anthony's spec — labels distinct from raw enum
// so operators aren't decoding underscores. Order deliberate: sysadmin first,
// governance next, delivery roles last.
const CURATED_ROLES: { value: string; label: string }[] = [
  { value: 'system_admin',        label: 'Sysadmin' },
  { value: 'finance_officer',     label: 'Admin & Finance Officer' },
  { value: 'chairperson',         label: 'Chairperson (DSL)' },
  { value: 'board_member',        label: 'Board Member' },
  { value: 'chief_examiner',      label: 'Chief Examiner' },
  { value: 'master_trainer',      label: 'Master Trainer' },
  { value: 'instructor_trainer',  label: 'Instructor Trainer' },
  { value: 'examiner',            label: 'Examiner' },
  { value: 'instructor',          label: 'Instructor' },
  { value: 'partner_center_admin',label: 'Partner Centre Admin' },
];

function AccountsTab({ states, roles }: { states: string[]; roles: string[] }) {
  const [rows, setRows] = useState<ProvisionedAccount[]>([]);
  const [memberships, setMemberships] = useState<Record<string, { id: string; role: string; state: string | null }[]>>({});
  const [memberships, setMemberships] = useState<Record<string, { id: string; role: string; state: string | null }[]>>({});
  const [load, setLoad] = useState<Load>('loading');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  // create form
  const [cKind, setCKind] = useState<'email' | 'username'>('email');
  const [cEmail, setCEmail] = useState('');
  const [cUsername, setCUsername] = useState('');
  const [cName, setCName] = useState('');
  const [cPassword, setCPassword] = useState('');
  const [cRole, setCRole] = useState('');
  const [cState, setCState] = useState('');
  const [cBusy, setCBusy] = useState(false);
  const [cMsg, setCMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // grant form (per expanded account)
  const [gRole, setGRole] = useState('');
  const [gState, setGState] = useState('');
  const [gExpires, setGExpires] = useState('');
  const [gBusy, setGBusy] = useState(false);
  const [gMsg, setGMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchRows = useCallback(async () => {
    setLoad('loading');
    const [accRes, unRes] = await Promise.all([
      supabase.rpc('list_provisioned_accounts'),
      supabase.rpc('list_account_usernames'),
    ]);
    if (accRes.error) { setLoad('error'); return; }
    const unMap: Record<string, string> = {};
    (unRes.data ?? []).forEach((r: { profile_id: string; username: string }) => {
      unMap[r.profile_id] = r.username;
    });
    const merged = (accRes.data ?? []).map((r: ProvisionedAccount) => ({
      ...r,
      username: unMap[r.profile_id] ?? null,
    }));
    // memberships alongside accounts, keyed by profile_id.
    // Defensive: if list_memberships fails or is unavailable, we still render
    // the accounts table — just without the current-roles chip strip.
    try {
      const memRes = await supabase.rpc('list_memberships');
      if (memRes.error) {
        console.warn('[Settings] list_memberships failed:', memRes.error);
      } else {
        const memMap: Record<string, { id: string; role: string; state: string | null }[]> = {};
        const memRows = (memRes.data ?? []) as Array<{
          membership_id: string; profile_id: string; role: string;
          state: string | null; status: string;
        }>;
        memRows.forEach((m) => {
          if (m.status !== 'active') return;
          if (!memMap[m.profile_id]) memMap[m.profile_id] = [];
          memMap[m.profile_id].push({ id: m.membership_id, role: m.role, state: m.state });
        });
        setMemberships(memMap);
      }
    } catch (e) {
      console.warn('[Settings] list_memberships threw:', e);
    }
    setRows(merged as ProvisionedAccount[]);
    setLoad('ready');
  }, []);
  const fetchMemberships = fetchRows;
  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function createAccount() {
    setCMsg(null);
    if (!cPassword || !cRole || !cState) {
      setCMsg({ ok: false, text: 'Password, role, and state are required.' });
      return;
    }
    if (cPassword.length < 8) {
      setCMsg({ ok: false, text: 'Password must be at least 8 characters.' });
      return;
    }
    if (cKind === 'email' && !cEmail.trim()) {
      setCMsg({ ok: false, text: 'Email is required for an email account.' });
      return;
    }
    if (cKind === 'username' && !cUsername.trim()) {
      setCMsg({ ok: false, text: 'Username is required for a username account.' });
      return;
    }
    if (cKind === 'username' && !/^[a-z0-9_.]{3,32}$/.test(cUsername.trim().toLowerCase())) {
      setCMsg({ ok: false, text: 'Username must be 3-32 lowercase letters, digits, underscore, or dot.' });
      return;
    }
    setCBusy(true);
    const { error } = cKind === 'email'
      ? await supabase.rpc('admin_create_account_with_password', {
          p_email: cEmail.trim().toLowerCase(),
          p_password: cPassword,
          p_role: cRole,
          p_state: cState,
          p_full_name: cName.trim() || null,
        })
      : await supabase.rpc('admin_create_username_account', {
          p_username: cUsername.trim().toLowerCase(),
          p_password: cPassword,
          p_role: cRole,
          p_state: cState,
          p_display_name: cName.trim() || null,
        });
    setCBusy(false);
    if (error) { setCMsg({ ok: false, text: error.message }); return; }
    const identity = cKind === 'email' ? cEmail.trim() : cUsername.trim().toLowerCase();
    setCMsg({ ok: true, text: `Account created for ${identity} with role ${pretty(cRole)}. Share the password securely.` });
    setCEmail(''); setCUsername(''); setCName(''); setCPassword(''); setCRole(''); setCState('');
    fetchRows();
  }

  async function grantRole(profileId: string) {
    setGMsg(null);
    if (!gRole || !gState) {
      setGMsg({ ok: false, text: 'Role and state are required.' });
      return;
    }
    setGBusy(true);
    const { error } = await supabase.rpc('admin_grant_membership', {
      _profile_id: profileId,
      _role: gRole,
      _state: gState,
      _centre_id: null,
      _expires_at: gExpires || null,
    });
    setGBusy(false);
    if (error) { setGMsg({ ok: false, text: error.message }); return; }
    setGMsg({ ok: true, text: `Role ${pretty(gRole)} granted.` });
    setGRole(''); setGState(''); setGExpires('');
    fetchRows();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) =>
      !q ||
      (r.email ?? '').toLowerCase().includes(q) ||
      (r.username ?? '').toLowerCase().includes(q) ||
      (r.full_name ?? '').toLowerCase().includes(q) ||
      (r.roles ?? '').toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <>
      <div className="mas-table-detail" style={{ marginBottom: '1rem' }}>
        <p className="mas-cell-sub" style={{ marginBottom: '0.5rem' }}>
          Create a login-ready account. <strong>Email</strong> accounts sign in with the
          email address and support password reset by mail. <strong>Username</strong> accounts
          sign in with a chosen username and are for role-holders without a working
          email — password reset is manual through this screen. Both grant the same
          role permissions.
        </p>
        <div className="mas-set-form" style={{ marginBottom: '0.4rem' }}>
          <label>Account type
            <select value={cKind} onChange={(e) => setCKind(e.target.value as 'email' | 'username')}>
              <option value="email">Email login</option>
              <option value="username">Username login</option>
            </select>
          </label>
        </div>
        <div className="mas-set-form">
          {cKind === 'email' ? (
            <label>Email
              <input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} style={{ width: '16rem' }} />
            </label>
          ) : (
            <label>Username
              <input type="text" value={cUsername}
                onChange={(e) => setCUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                placeholder="e.g. clara" style={{ width: '12rem' }} />
            </label>
          )}
          <label>Display name
            <input type="text" value={cName} onChange={(e) => setCName(e.target.value)} style={{ width: '14rem' }} />
          </label>
          <label>Password
            <input type="text" value={cPassword} onChange={(e) => setCPassword(e.target.value)} placeholder="min 8 chars" style={{ width: '11rem' }} />
          </label>
          <label>Role
            <select value={cRole} onChange={(e) => setCRole(e.target.value)}>
              <option value="">—</option>
              {CURATED_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <label>State
            <select value={cState} onChange={(e) => setCState(e.target.value)}>
              <option value="">—</option>
              {states.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
            </select>
          </label>
          <button className="mas-btn-primary mas-btn-compact" onClick={createAccount} disabled={cBusy}>
            {cBusy ? 'Creating…' : 'Create account'}
          </button>
        </div>
        {cMsg && (
          <p className={`mas-status ${cMsg.ok ? 'mas-status-good' : 'mas-status-bad'}`} style={{ marginTop: '0.4rem' }}>
            {cMsg.text}
          </p>
        )}
      </div>

      <div className="mas-admin-toolbar" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="mas-btn-ghost" onClick={fetchRows} disabled={load === 'loading'}>Refresh</button>
        <input className="mas-input" type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search email, name, role" style={{ maxWidth: '22rem' }} />
        {load === 'ready' && <span className="mas-admin-count">{filtered.length} shown</span>}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load accounts. Refresh to try again.</p>}
      {load === 'ready' && filtered.length === 0 && <p className="mas-status">No accounts found.</p>}

      {load === 'ready' && filtered.length > 0 && (
        <div className="mas-table-wrap">
          <table className="mas-table mas-tight">
            <thead>
              <tr>
                <th>Login</th><th>Name</th><th>Roles</th><th>Status</th>
                <th>Created</th><th>Last sign-in</th>
                <th className="mas-table-actioncol">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isOpen = expanded === r.profile_id;
                return (
                  <Fragment key={r.profile_id}>
                    <tr className={isOpen ? 'is-open' : undefined}>
                      <td className="mas-cell-strong">
                        {r.username ?? r.email}
                        {r.username && <div className="mas-cell-sub">username</div>}
                      </td>
                      <td>{r.full_name || <span className="mas-cell-sub">—</span>}</td>
                      <td>{r.roles ? pretty(r.roles) : <span className="mas-cell-sub">none</span>}</td>
                      <td>{pretty(r.status) || '—'}</td>
                      <td>{prettyDate(r.created_at)}</td>
                      <td>{prettyDate(r.last_sign_in_at)}</td>
                      <td className="mas-table-actioncol">
                        <button className="mas-link" onClick={() => {
                          setGMsg(null); setGRole(''); setGState(''); setGExpires('');
                          setExpanded(isOpen ? null : r.profile_id);
                        }}>
                          {isOpen ? 'Close' : 'Grant role'}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="mas-table-detailrow">
                        <td colSpan={7}>
                          <div className="mas-table-detail">
                            <div className="mas-set-form">
                              <label>Role
                                <select value={gRole} onChange={(e) => setGRole(e.target.value)}>
                                  <option value="">—</option>
                                  {CURATED_ROLES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                                </select>
                              </label>
                              <label>State
                                <select value={gState} onChange={(e) => setGState(e.target.value)}>
                                  <option value="">—</option>
                                  {states.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
                                </select>
                              </label>
                              <label>Expires (optional)
                                <input type="date" value={gExpires} onChange={(e) => setGExpires(e.target.value)} />
                              </label>
                              <button className="mas-btn-primary mas-btn-compact" onClick={() => grantRole(r.profile_id)} disabled={gBusy}>
                                {gBusy ? 'Granting…' : 'Grant'}
                              </button>
                            </div>
                            {gMsg && (
                              <p className={`mas-status ${gMsg.ok ? 'mas-status-good' : 'mas-status-bad'}`} style={{ marginTop: '0.4rem' }}>
                                {gMsg.text}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ============================================================ Store products
interface StoreProduct {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  unit_price: number;
  currency: string | null;
  active: boolean;
  sort_order: number | null;
  image_paths: string[];
  stock_qty: number | null;
  updated_at: string | null;
}

const CANON_CATEGORIES = ['branding', 'teaching_materials'];

function publicImageUrl(path: string): string {
  return supabase.storage.from('store-products').getPublicUrl(path).data.publicUrl;
}

function ProductsTab() {
  const [rows, setRows] = useState<StoreProduct[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [expanded, setExpanded] = useState<string | null>(null); // product id or 'new'
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // form state
  const [fCode, setFCode] = useState('');
  const [fName, setFName] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fCategory, setFCategory] = useState('branding');
  const [fPrice, setFPrice] = useState('');
  const [fStock, setFStock] = useState('');
  const [fSort, setFSort] = useState('');
  const [fActive, setFActive] = useState(true);
  const [uploading, setUploading] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase
      .from('store_products')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name');
    if (error) { setLoad('error'); return; }
    setRows((data ?? []) as StoreProduct[]);
    setLoad('ready');
  }, []);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  function openEdit(p: StoreProduct | null) {
    setMsg(null);
    if (p) {
      setExpanded(p.id);
      setFCode(p.code); setFName(p.name); setFDesc(p.description ?? '');
      setFCategory(p.category); setFPrice(String(p.unit_price));
      setFStock(p.stock_qty == null ? '' : String(p.stock_qty));
      setFSort(p.sort_order == null ? '' : String(p.sort_order));
      setFActive(p.active);
    } else {
      setExpanded('new');
      setFCode(''); setFName(''); setFDesc(''); setFCategory('branding');
      setFPrice(''); setFStock(''); setFSort(''); setFActive(true);
    }
  }

  async function saveProduct(existing: StoreProduct | null) {
    setMsg(null);
    const price = Number(fPrice);
    if (!fCode.trim() || !fName.trim() || !fCategory || !(price >= 0)) {
      setMsg({ ok: false, text: 'Code, name, category, and a non-negative price are required.' });
      return;
    }
    setBusy(true);
    const payload = {
      code: fCode.trim(),
      name: fName.trim(),
      description: fDesc.trim() || null,
      category: fCategory,
      unit_price: price,
      stock_qty: fStock.trim() === '' ? null : Number(fStock),
      sort_order: fSort.trim() === '' ? null : Number(fSort),
      active: fActive,
    };
    const q = existing
      ? supabase.from('store_products').update(payload).eq('id', existing.id)
      : supabase.from('store_products').insert(payload);
    const { error } = await q;
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: existing ? 'Product updated.' : 'Product created — open it to add images.' });
    if (!existing) setExpanded(null);
    fetchRows();
  }

  async function uploadImage(p: StoreProduct, file: File) {
    setUploading(true); setMsg(null);
    const clean = file.name.replace(/[^A-Za-z0-9._-]/g, '_');
    const path = `products/${p.id}/${Date.now()}_${clean}`;
    const up = await supabase.storage.from('store-products').upload(path, file, { upsert: false });
    if (up.error) { setUploading(false); setMsg({ ok: false, text: up.error.message }); return; }
    const { error } = await supabase.from('store_products')
      .update({ image_paths: [...(p.image_paths ?? []), path] })
      .eq('id', p.id);
    setUploading(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    fetchRows();
  }

  async function removeImage(p: StoreProduct, path: string) {
    setMsg(null);
    const { error } = await supabase.from('store_products')
      .update({ image_paths: (p.image_paths ?? []).filter((x) => x !== path) })
      .eq('id', p.id);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    await supabase.storage.from('store-products').remove([path]); // best-effort
    fetchRows();
  }

  async function makePrimary(p: StoreProduct, path: string) {
    setMsg(null);
    const rest = (p.image_paths ?? []).filter((x) => x !== path);
    const { error } = await supabase.from('store_products')
      .update({ image_paths: [path, ...rest] })
      .eq('id', p.id);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    fetchRows();
  }

  const categoryOptions = useMemo(() => {
    const set = new Set(CANON_CATEGORIES);
    for (const r of rows) set.add(r.category);
    if (fCategory) set.add(fCategory);
    return Array.from(set);
  }, [rows, fCategory]);

  const editing = expanded && expanded !== 'new' ? rows.find((r) => r.id === expanded) ?? null : null;

  const form = (existing: StoreProduct | null) => (
    <div className="mas-table-detail">
      <div className="mas-set-form">
        <label>Code
          <input type="text" value={fCode} onChange={(e) => setFCode(e.target.value)} style={{ width: '8rem' }} />
        </label>
        <label>Name
          <input type="text" value={fName} onChange={(e) => setFName(e.target.value)} style={{ width: '18rem' }} />
        </label>
        <label>Category
          <select value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
            {categoryOptions.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}
          </select>
        </label>
        <label>Price (RM)
          <input type="number" step="0.01" value={fPrice} onChange={(e) => setFPrice(e.target.value)} style={{ width: '7rem' }} />
        </label>
        <label>Stock (blank = untracked)
          <input type="number" value={fStock} onChange={(e) => setFStock(e.target.value)} style={{ width: '9rem' }} />
        </label>
        <label>Sort
          <input type="number" value={fSort} onChange={(e) => setFSort(e.target.value)} style={{ width: '5rem' }} />
        </label>
        <label>Active
          <select value={fActive ? 'yes' : 'no'} onChange={(e) => setFActive(e.target.value === 'yes')}>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
      </div>
      <div className="mas-set-form" style={{ marginTop: '0.5rem' }}>
        <label style={{ flex: 1, minWidth: '24rem' }}>Description
          <textarea rows={2} value={fDesc} onChange={(e) => setFDesc(e.target.value)} />
        </label>
        <button className="mas-btn-primary mas-btn-compact" onClick={() => saveProduct(existing)} disabled={busy}>
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Create product'}
        </button>
      </div>

      {existing && (
        <>
          <p className="mas-cell-sub" style={{ margin: '0.6rem 0 0.2rem' }}>
            Images — first is the primary shown in the catalogue.
          </p>
          <div className="mas-set-thumbs">
            {(existing.image_paths ?? []).map((path, i) => (
              <div key={path} className={`mas-set-thumb${i === 0 ? ' mas-set-primary' : ''}`}>
                <img src={publicImageUrl(path)} alt="" />
                {i !== 0 && <button className="mas-link" onClick={() => makePrimary(existing, path)}>Make primary</button>}
                {i !== 0 && ' '}
                <button className="mas-link" onClick={() => removeImage(existing, path)}>Remove</button>
              </div>
            ))}
            <div className="mas-set-thumb" style={{ display: 'flex', alignItems: 'center' }}>
              <label className="mas-link" style={{ cursor: 'pointer' }}>
                {uploading ? 'Uploading…' : '+ Add image'}
                <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && existing) uploadImage(existing, f);
                    e.target.value = '';
                  }} />
              </label>
            </div>
          </div>
        </>
      )}

      {msg && (
        <p className={`mas-status ${msg.ok ? 'mas-status-good' : 'mas-status-bad'}`} style={{ marginTop: '0.4rem' }}>
          {msg.text}
        </p>
      )}
    </div>
  );

  return (
    <>
      <div className="mas-admin-toolbar" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="mas-btn-ghost" onClick={fetchRows} disabled={load === 'loading'}>Refresh</button>
        <button className="mas-btn-primary mas-btn-compact" onClick={() => openEdit(null)}>New product</button>
        {load === 'ready' && <span className="mas-admin-count">{rows.length} products</span>}
      </div>

      {expanded === 'new' && form(null)}

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load products. Refresh to try again.</p>}

      {load === 'ready' && rows.length > 0 && (
        <div className="mas-table-wrap">
          <table className="mas-table mas-tight">
            <thead>
              <tr>
                <th>Code</th><th>Name</th><th>Category</th>
                <th className="mas-num">Price</th><th className="mas-num">Stock</th>
                <th>Active</th><th>Images</th>
                <th className="mas-table-actioncol">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const isOpen = expanded === p.id;
                return (
                  <Fragment key={p.id}>
                    <tr className={isOpen ? 'is-open' : undefined}>
                      <td className="mas-cell-strong">{p.code}</td>
                      <td>{p.name}</td>
                      <td>{pretty(p.category)}</td>
                      <td className="mas-num">{money(p.unit_price)}</td>
                      <td className="mas-num">{p.stock_qty == null ? '—' : p.stock_qty}</td>
                      <td>{p.active ? 'Yes' : 'No'}</td>
                      <td>{(p.image_paths ?? []).length || <span className="mas-cell-sub">none</span>}</td>
                      <td className="mas-table-actioncol">
                        <button className="mas-link" onClick={() => (isOpen ? setExpanded(null) : openEdit(p))}>
                          {isOpen ? 'Close' : 'Edit'}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="mas-table-detailrow">
                        <td colSpan={8}>{form(p)}</td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ============================================================ Parameters
interface AppSetting { key: string; value: number; updated_at: string | null; }

function ParamsTab() {
  const [rows, setRows] = useState<AppSetting[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchRows = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.from('app_settings').select('*').order('key');
    if (error) { setLoad('error'); return; }
    setRows((data ?? []) as AppSetting[]);
    setLoad('ready');
  }, []);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function save(key: string) {
    const v = Number(edit[key]);
    if (Number.isNaN(v)) { setMsg({ ok: false, text: 'Value must be a number.' }); return; }
    setBusy(key); setMsg(null);
    const { error } = await supabase.from('app_settings')
      .update({ value: v, updated_at: new Date().toISOString() })
      .eq('key', key);
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: `${key} updated.` });
    setEdit((m) => { const n = { ...m }; delete n[key]; return n; });
    fetchRows();
  }

  async function addNew() {
    const v = Number(newVal);
    if (!newKey.trim() || Number.isNaN(v)) {
      setMsg({ ok: false, text: 'Key and a numeric value are required.' });
      return;
    }
    setBusy('__new'); setMsg(null);
    const { error } = await supabase.from('app_settings').insert({ key: newKey.trim(), value: v });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: `${newKey.trim()} added.` });
    setNewKey(''); setNewVal('');
    fetchRows();
  }

  return (
    <>
      <p className="mas-cell-sub" style={{ marginBottom: '0.6rem' }}>
        Operational parameters — the Portal half of Manual Appendix F. Values here are
        authoritative for calculations (e.g. examiner payout). Documents reference,
        never restate.
      </p>
      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load parameters.</p>}
      {load === 'ready' && (
        <div className="mas-table-wrap">
          <table className="mas-table mas-tight">
            <thead>
              <tr><th>Key</th><th className="mas-num">Value</th><th>Updated</th><th className="mas-table-actioncol">Action</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="mas-cell-strong">{r.key}</td>
                  <td className="mas-num">
                    {edit[r.key] != null ? (
                      <input type="number" step="0.01" value={edit[r.key]}
                        onChange={(e) => setEdit((m) => ({ ...m, [r.key]: e.target.value }))}
                        style={{ width: '8rem', font: 'inherit', padding: '0.2rem 0.4rem', border: '1px solid var(--mas-line,#e3e9f3)', borderRadius: 6 }} />
                    ) : Number(r.value).toFixed(2)}
                  </td>
                  <td>{prettyDate(r.updated_at)}</td>
                  <td className="mas-table-actioncol">
                    {edit[r.key] != null ? (
                      <>
                        <button className="mas-link" onClick={() => save(r.key)} disabled={busy === r.key}>Save</button>
                        <button className="mas-link" onClick={() => setEdit((m) => { const n = { ...m }; delete n[r.key]; return n; })}>Cancel</button>
                      </>
                    ) : (
                      <button className="mas-link" onClick={() => setEdit((m) => ({ ...m, [r.key]: String(r.value) }))}>Edit</button>
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <td>
                  <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="new_parameter_key"
                    style={{ width: '16rem', font: 'inherit', padding: '0.2rem 0.4rem', border: '1px solid var(--mas-line,#e3e9f3)', borderRadius: 6 }} />
                </td>
                <td className="mas-num">
                  <input type="number" step="0.01" value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder="0.00"
                    style={{ width: '8rem', font: 'inherit', padding: '0.2rem 0.4rem', border: '1px solid var(--mas-line,#e3e9f3)', borderRadius: 6 }} />
                </td>
                <td />
                <td className="mas-table-actioncol">
                  <button className="mas-link" onClick={addNew} disabled={busy === '__new'}>Add</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {msg && (
        <p className={`mas-status ${msg.ok ? 'mas-status-good' : 'mas-status-bad'}`} style={{ marginTop: '0.4rem' }}>
          {msg.text}
        </p>
      )}
    </>
  );
}

// ============================================================ Flags
interface AppFlag { key: string; enabled: boolean; updated_at: string | null; }

function FlagsTab() {
  const [rows, setRows] = useState<AppFlag[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [newKey, setNewKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchRows = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.from('app_flags').select('*').order('key');
    if (error) { setLoad('error'); return; }
    setRows((data ?? []) as AppFlag[]);
    setLoad('ready');
  }, []);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function toggle(f: AppFlag) {
    setBusy(f.key); setMsg(null);
    const { error } = await supabase.from('app_flags')
      .update({ enabled: !f.enabled, updated_at: new Date().toISOString() })
      .eq('key', f.key);
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    fetchRows();
  }

  async function addFlag() {
    if (!newKey.trim()) return;
    setBusy('__new'); setMsg(null);
    const { error } = await supabase.from('app_flags').insert({ key: newKey.trim(), enabled: false });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setNewKey('');
    fetchRows();
  }

  return (
    <>
      <p className="mas-cell-sub" style={{ marginBottom: '0.6rem' }}>
        Feature flags. <code>store_enabled</code> controls the buyer-facing store.
      </p>
      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load flags.</p>}
      {load === 'ready' && (
        <div className="mas-table-wrap">
          <table className="mas-table mas-tight">
            <thead>
              <tr><th>Flag</th><th>Enabled</th><th>Updated</th><th className="mas-table-actioncol">Action</th></tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.key}>
                  <td className="mas-cell-strong">{f.key}</td>
                  <td>{f.enabled ? 'On' : 'Off'}</td>
                  <td>{prettyDate(f.updated_at)}</td>
                  <td className="mas-table-actioncol">
                    <button className="mas-link" onClick={() => toggle(f)} disabled={busy === f.key}>
                      {f.enabled ? 'Turn off' : 'Turn on'}
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={3}>
                  <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="new_flag_key"
                    style={{ width: '16rem', font: 'inherit', padding: '0.2rem 0.4rem', border: '1px solid var(--mas-line,#e3e9f3)', borderRadius: 6 }} />
                </td>
                <td className="mas-table-actioncol">
                  <button className="mas-link" onClick={addFlag} disabled={busy === '__new'}>Add</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {msg && <p className="mas-status mas-status-bad" style={{ marginTop: '0.4rem' }}>{msg.text}</p>}
    </>
  );
}


// ============================================================ Role contacts
interface RoleContact {
  alias: string;
  holder_id: string | null;
  full_name: string | null;
  email: string | null;
}
interface ContactCandidate {
  profile_id: string;
  full_name: string | null;
  email: string;
}

const ALIASES: { alias: string; label: string; role: string }[] = [
  { alias: 'enquiries',    label: 'enquiries@masbadges.org',    role: 'Finance Officer' },
  { alias: 'finance',      label: 'finance@masbadges.org',      role: 'Finance Officer' },
  { alias: 'safeguarding', label: 'safeguarding@masbadges.org', role: 'Chairperson (Designated Safeguarding Lead)' },
];

function ContactsTab() {
  const [rows, setRows] = useState<RoleContact[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [candidates, setCandidates] = useState<Record<string, ContactCandidate[]>>({});
  const [pending, setPending] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoad('loading');
    const results = await Promise.all(
      ALIASES.map((a) => supabase.rpc('resolve_role_contact', { _alias: a.alias }))
    );
    const merged: RoleContact[] = ALIASES.map((a, i) => {
      const row = (results[i].data as RoleContact[] | null)?.[0];
      return row ?? { alias: a.alias, holder_id: null, full_name: null, email: null };
    });
    setRows(merged);
    // load candidates in parallel — sysadmin-gated, so only fires here
    const candResults = await Promise.all(
      ALIASES.map((a) => supabase.rpc('list_role_contact_candidates', { _alias: a.alias }))
    );
    const candMap: Record<string, ContactCandidate[]> = {};
    ALIASES.forEach((a, i) => { candMap[a.alias] = (candResults[i].data ?? []) as ContactCandidate[]; });
    setCandidates(candMap);
    setLoad('ready');
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function assign(alias: string) {
    const nextId = pending[alias];
    setMsg(null);
    setBusy(alias);
    const { error } = await supabase.rpc('upsert_role_contact', {
      _alias: alias,
      _holder_id: nextId || null,
    });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: nextId ? 'Assignment updated.' : 'Assignment cleared.' });
    setPending((m) => { const n = { ...m }; delete n[alias]; return n; });
    fetchAll();
  }

  return (
    <>
      <p className="mas-cell-sub" style={{ marginBottom: '0.6rem' }}>
        Point each published alias to the current role holder. Screens and templates
        resolve the current holder's name and email through this table. External mail
        delivery (MX / forwarding) is configured separately at the mail provider.
      </p>
      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load role contacts.</p>}
      {load === 'ready' && (
        <div className="mas-table-wrap">
          <table className="mas-table mas-tight">
            <thead>
              <tr>
                <th>Alias</th>
                <th>Role</th>
                <th>Current holder</th>
                <th>Assign</th>
                <th className="mas-table-actioncol">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = ALIASES.find((a) => a.alias === r.alias)!;
                const cands = candidates[r.alias] ?? [];
                const selected = pending[r.alias] ?? r.holder_id ?? '';
                const changed = selected !== (r.holder_id ?? '');
                return (
                  <tr key={r.alias}>
                    <td className="mas-cell-strong">{meta.label}</td>
                    <td>{meta.role}</td>
                    <td>
                      {r.full_name || r.email
                        ? <>{r.full_name || '—'}<div className="mas-cell-sub">{r.email}</div></>
                        : <span className="mas-cell-sub">Not assigned</span>}
                    </td>
                    <td>
                      <select
                        value={selected}
                        onChange={(e) => setPending((m) => ({ ...m, [r.alias]: e.target.value }))}
                        style={{ font: 'inherit', padding: '0.25rem 0.4rem', border: '1px solid var(--mas-line,#e3e9f3)', borderRadius: 6 }}
                      >
                        <option value="">— unassigned —</option>
                        {cands.map((c) => (
                          <option key={c.profile_id} value={c.profile_id}>
                            {c.full_name ? `${c.full_name} (${c.email})` : c.email}
                          </option>
                        ))}
                      </select>
                      {cands.length === 0 && (
                        <p className="mas-cell-sub" style={{ marginTop: '0.2rem' }}>
                          No active {meta.role} account. Assign the role in the Accounts tab first.
                        </p>
                      )}
                    </td>
                    <td className="mas-table-actioncol">
                      <button
                        className="mas-link"
                        onClick={() => assign(r.alias)}
                        disabled={!changed || busy === r.alias}
                      >
                        {busy === r.alias ? 'Saving…' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {msg && (
        <p className={`mas-status ${msg.ok ? 'mas-status-good' : 'mas-status-bad'}`} style={{ marginTop: '0.4rem' }}>
          {msg.text}
        </p>
      )}
    </>
  );
}

// ============================================================ System
function SystemTab() {
  const [build, setBuild] = useState<string>('…');
  useEffect(() => {
    fetch(`/version.json?ts=${Date.now()}`)
      .then((r) => r.json())
      .then((j) => setBuild(String(j.build ?? j.version ?? JSON.stringify(j))))
      .catch(() => setBuild('unavailable'));
  }, []);
  const mode = (import.meta as unknown as { env?: Record<string, string> }).env?.MODE ?? 'unknown';
  return (
    <div className="mas-table-detail">
      <p><strong>Build:</strong> {build}</p>
      <p><strong>Environment:</strong> {mode}</p>
      <p className="mas-cell-sub" style={{ marginTop: '0.6rem' }}>
        A stale-build banner appears automatically when a newer build is deployed
        (UpdateBanner). Manage accounts, resources, and portal parameters via the
        respective tabs.
      </p>
    </div>
  );
}

// ============================================================ Page
export default function Settings() {
  const [tab, setTab] = useState<Tab>('accounts');
  const [states, setStates] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    supabase.rpc('list_my_states').then(({ data }) => {
      if (data) setStates((data as unknown[]).map((x) => String((x as Record<string, unknown>).list_my_states ?? x)));
    });
    supabase.rpc('list_roles').then(({ data }) => {
      if (data) setRoles((data as { role: string }[]).map((x) => x.role));
    });
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'accounts', label: 'Accounts' },
    { id: 'products', label: 'Store products' },
    { id: 'params', label: 'Parameters' },
    { id: 'flags', label: 'Flags' },
    { id: 'contacts', label: 'Role contacts' },
    { id: 'system', label: 'System' },
  ];

  return (
    <section className="mas-page mas-page-wide">
      <style>{CSS}</style>
      <header className="mas-page-head">
        <p className="mas-eyebrow">System administration</p>
        <h1>Settings</h1>
        <p className="mas-lede">
          Account provisioning, store catalogue, operational parameters, and feature
          flags. This area is restricted to the system administrator; every action is
          enforced server-side.
        </p>
      </header>

      <div className="mas-admin-toolbar" style={{ gap: '0.3rem', flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
            className={tab === t.id ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'accounts' && <AccountsTab states={states} roles={roles} />}
      {tab === 'products' && <ProductsTab />}
      {tab === 'params' && <ParamsTab />}
      {tab === 'flags' && <FlagsTab />}
      {tab === 'contacts' && <ContactsTab />}
      {tab === 'system' && <SystemTab />}
    </section>
  );
}
