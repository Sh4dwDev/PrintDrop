import { useEffect, useState } from 'react';
import { Box, Check, ChevronRight, Clock3, Download, FileBox, Grid2X2, Link2, LogOut, Menu, PackageCheck, Plus, Printer, Save, Send, Settings2, ShieldCheck, Upload, UserRound, X } from 'lucide-react';
import { downloadOrderFile, request } from './api';
import { isConfigured } from './supabase';

const MATERIALS = ['PLA', 'PETG', 'TPU', 'ABS'];
const COLOURS = ['Black', 'White', 'Grey', 'Orange', 'Blue', 'Green', 'Other'];
const STATUSES = ['Reviewing', 'Quoted', 'Printing', 'Ready', 'Completed', 'Declined'];
const statusIcons = { Reviewing: Clock3, Quoted: PackageCheck, Printing: Printer, Ready: Check, Completed: Check, Declined: X };

function Logo() {
  return <div className="brand"><span className="brand-mark"><Printer size={24} /></span><span>PrintDrop</span></div>;
}

function Auth({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      const data = await request(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(form) });
      if (data.needsConfirmation) { setMessage('Check your email to confirm your account, then sign in.'); setMode('login'); return; }
      onAuth(data.user);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <main className="auth-page">
    <section className="auth-intro"><Logo /><div><h1>From idea to object.</h1><p>Send your model. Pick the details. I’ll handle the printing.</p></div><div className="contours" /></section>
    <section className="auth-panel"><form className="auth-card" onSubmit={submit}>
      <span className="auth-icon"><Box size={26} /></span>
      <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
      <p>{mode === 'login' ? 'Sign in to send and track your prints.' : 'Your first registered account becomes the admin.'}</p>
      {mode === 'register' && <label>Your name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Alex" /></label>}
      <label>Email<input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label>
      <label>Password<input required minLength="6" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" /></label>
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice success">{message}</div>}
      <button className="primary wide" disabled={busy}>{busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
      <button className="text-button" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button>
    </form></section>
  </main>;
}

function Sidebar({ active, setActive, user, logout, open, close }) {
  const links = [['dashboard', Grid2X2, 'Dashboard'], ['new', Plus, 'New request'], ['orders', FileBox, 'My orders']];
  return <><div className={`sidebar-backdrop ${open ? 'show' : ''}`} onClick={close} /><aside className={`sidebar ${open ? 'open' : ''}`}>
    <div className="sidebar-top"><Logo /><button className="close-menu" onClick={close}><X /></button></div>
    <nav>{links.map(([id, Icon, label]) => <button key={id} className={active === id ? 'active' : ''} onClick={() => { setActive(id); close(); }}><Icon size={20} />{label}</button>)}</nav>
    {user.role === 'admin' && <button className={`admin-link ${active === 'admin' ? 'active' : ''}`} onClick={() => { setActive('admin'); close(); }}><ShieldCheck size={22} /><span><strong>Admin view</strong><small>Orders and downloads</small></span></button>}
    <div className="sidebar-foot"><p>DESIGN IT.<br />DROP IT.<br />WE PRINT IT.</p><button onClick={logout}><LogOut size={18} /> Sign out</button></div>
  </aside></>;
}

function NewOrder({ onCreated }) {
  const [form, setForm] = useState({ name: '', link: '', material: 'PLA', colour: 'Black', quantity: 1, notes: '' });
  const [file, setFile] = useState(null); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setMessage('');
    if (!file && !form.link) return setMessage('Add a file or paste a model link.');
    const body = new FormData(); Object.entries(form).forEach(([key, value]) => body.append(key, value)); if (file) body.append('model', file);
    setBusy(true);
    try { await request('/orders', { method: 'POST', body }); setForm({ name: '', link: '', material: 'PLA', colour: 'Black', quantity: 1, notes: '' }); setFile(null); setMessage('Request sent!'); onCreated(); }
    catch (err) { setMessage(err.message); } finally { setBusy(false); }
  }
  return <form className="request-panel" onSubmit={submit}>
    <h2>What should I print?</h2>
    <div className="source-grid">
      <label className={`dropzone ${file ? 'has-file' : ''}`}><input type="file" accept=".stl,.3mf,.obj,.zip" onChange={e => setFile(e.target.files[0] || null)} /><Upload size={28} /><strong>{file ? file.name : 'Upload a file'}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB selected` : 'STL, 3MF, OBJ or ZIP · up to 200 MB'}</span></label>
      <div className="or"><span>OR</span></div>
      <label className="link-field"><strong>Or paste a model link</strong><span className="input-icon"><Link2 size={18} /><input type="url" value={form.link} onChange={e => setForm({ ...form, link: e.target.value })} placeholder="https://printables.com/model/..." /></span><small>Printables, Thingiverse, MakerWorld or a direct link</small></label>
    </div>
    <div className="fields-row">
      <label>Print name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Desk organizer" /></label>
      <label>Material<select value={form.material} onChange={e => setForm({ ...form, material: e.target.value })}>{MATERIALS.map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Colour<select value={form.colour} onChange={e => setForm({ ...form, colour: e.target.value })}>{COLOURS.map(x => <option key={x}>{x}</option>)}</select></label>
      <label className="quantity">Quantity<input type="number" min="1" max="50" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></label>
    </div>
    <div className="notes-submit"><label>Notes<textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Size, strength, deadline, or anything else I should know…" /></label><button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Submit request'}<Send size={17} /></button></div>
    {message && <div className={`notice ${message.includes('sent') ? 'success' : 'error'}`}>{message}</div>}
  </form>;
}

function PriceEditor({ order, onUpdate }) {
  return <label className="weight-editor">
    <span className="sr-only">Estimated weight in grams</span>
    <span className="weight-input"><input type="number" min="0.1" step="0.1" defaultValue={order.estimatedWeightG || ''} placeholder="0" onBlur={event => {
      const value = event.target.value ? Number(event.target.value) : null;
      if (value !== Number(order.estimatedWeightG || 0)) onUpdate(order.id, { estimatedWeightG: value });
    }} /><small>g</small></span>
  </label>;
}

function PricingSettings({ pricing, onSave }) {
  const [form, setForm] = useState(pricing);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(pricing), [pricing]);
  if (!form) return null;
  const petgCost = 80 / 1000 * Number(form.petgCostPerKg || 0);
  const petgProfit = petgCost * Number(form.profitMarginPercent || 0) / 100;
  function change(key, value) { setForm(current => ({ ...current, [key]: value })); }
  async function submit(event) {
    event.preventDefault(); setMessage(''); setBusy(true);
    try { await onSave(form); setMessage('Pricing settings saved.'); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  const materials = [['plaCostPerKg', 'PLA'], ['petgCostPerKg', 'PETG'], ['tpuCostPerKg', 'TPU'], ['absCostPerKg', 'ABS']];
  return <form className="pricing-panel" onSubmit={submit}>
    <div className="pricing-heading"><span className="settings-icon"><Settings2 size={20} /></span><div><h2>Pricing settings</h2><p>Set your material cost and the profit added on top.</p></div></div>
    <div className="pricing-fields">
      {materials.map(([key, label]) => <label key={key}>{label} cost<input required type="number" min="0" step="1" value={form[key]} onChange={event => change(key, event.target.value)} /><small>kr per kg</small></label>)}
      <label>Profit margin<input required type="number" min="0" max="1000" step="0.1" value={form.profitMarginPercent} onChange={event => change('profitMarginPercent', event.target.value)} /><small>% added to material cost</small></label>
    </div>
    <div className="price-example"><div><small>Example · 80 g PETG</small><strong>{petgCost.toFixed(2)} kr material + {petgProfit.toFixed(2)} kr profit</strong></div><span>{(petgCost + petgProfit).toFixed(2)} kr</span></div>
    <div className="pricing-actions">{message && <span className={message.includes('saved') ? 'saved' : 'save-error'}>{message}</span>}<button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save pricing'}<Save size={17} /></button></div>
  </form>;
}

function Orders({ orders, admin, onUpdate, title = 'Recent orders' }) {
  if (!orders.length) return <section className="orders-panel"><div className="section-head"><h2>{title}</h2></div><div className="empty"><FileBox size={28} /><strong>No print requests yet</strong><span>Your submitted orders will show up here.</span></div></section>;
  return <section className="orders-panel"><div className="section-head"><h2>{title}</h2><div className="section-meta">{admin && <strong>Enter sliced weight to calculate</strong>}<span>{orders.length} {orders.length === 1 ? 'request' : 'requests'}</span></div></div><div className="order-list">
    <div className={`order-row order-head ${admin ? 'admin-row' : ''}`}><span>Order</span><span>Print</span>{admin && <span>Requested by</span>}<span>Material</span>{admin && <span>Weight</span>}{admin && <span>Cost + profit</span>}<span>Price</span><span>Status</span><span>Updated</span><span /></div>
    {orders.map(order => { const Icon = statusIcons[order.status] || Clock3; return <div className={`order-row ${admin ? 'admin-row' : ''}`} key={order.id}>
      <span className="order-id"><FileBox size={18} />#{order.id.slice(-6).toUpperCase()}</span><span><strong>{order.name}</strong><small>{order.colour} · Qty {order.quantity}</small></span>{admin && <span><strong>{order.userName}</strong><small>{order.userEmail}</small></span>}<span>{order.material}</span>
      {admin && <span><PriceEditor order={order} onUpdate={onUpdate} /></span>}{admin && <span className="price-breakdown">{order.materialCostNok ? <><strong>{Number(order.materialCostNok).toFixed(2)} kr</strong><small>+ {Number(order.profitAmountNok).toFixed(2)} kr</small></> : '—'}</span>}<span className="price">{order.quotedPriceNok ? `${Number(order.quotedPriceNok).toFixed(2)} kr` : '—'}</span>
      <span>{admin ? <select className={`status ${order.status.toLowerCase()}`} value={order.status} onChange={e => onUpdate(order.id, { status: e.target.value })}>{STATUSES.map(x => <option key={x}>{x}</option>)}</select> : <span className={`status ${order.status.toLowerCase()}`}><Icon size={15} />{order.status}</span>}</span>
      <span>{new Date(order.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><span className="actions">{order.fileName && <button title="Download model file" onClick={() => downloadOrderFile(order)}><Download size={18} /></button>}{order.link && <a title="Open model link" href={order.link} target="_blank" rel="noreferrer"><ChevronRight size={19} /></a>}</span>
    </div>; })}</div></section>;
}

export function App() {
  const [user, setUser] = useState(null); const [loading, setLoading] = useState(true); const [orders, setOrders] = useState([]); const [pricing, setPricing] = useState(null); const [active, setActive] = useState('dashboard'); const [menu, setMenu] = useState(false);
  async function loadOrders(currentUser = user) { if (!currentUser) return; try { setOrders((await request(currentUser.role === 'admin' && active === 'admin' ? '/admin/orders' : '/orders')).orders); } catch {} }
  useEffect(() => { if (!isConfigured) { setLoading(false); return; } request('/auth/me').then(x => setUser(x.user)).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(() => { loadOrders(); }, [user, active]);
  useEffect(() => { if (user?.role === 'admin' && active === 'admin') request('/pricing').then(result => setPricing(result.pricing)).catch(() => {}); }, [user, active]);
  async function logout() { await request('/auth/logout'); setUser(null); }
  async function update(id, changes) { await request(`/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }); loadOrders(); }
  async function savePricing(changes) { const result = await request('/admin/pricing', { method: 'PATCH', body: JSON.stringify(changes) }); setPricing(result.pricing); loadOrders(); }
  if (!isConfigured) return <main className="setup-page"><Logo /><section><h1>Connect Supabase</h1><p>Add these two environment variables to run PrintDrop:</p><code>VITE_SUPABASE_URL</code><code>VITE_SUPABASE_PUBLISHABLE_KEY</code><p className="setup-note">Then run <strong>supabase/schema.sql</strong> in your Supabase SQL Editor.</p></section></main>;
  if (loading) return <div className="loader"><Printer className="spin" /> Loading PrintDrop…</div>;
  if (!user) return <Auth onAuth={setUser} />;
  const showForm = active === 'dashboard' || active === 'new';
  return <div className="app-shell"><Sidebar active={active} setActive={setActive} user={user} logout={logout} open={menu} close={() => setMenu(false)} /><main className="content">
    <header><button className="menu-button" onClick={() => setMenu(true)}><Menu /></button><div><h1>{active === 'admin' ? 'Print queue' : active === 'orders' ? 'My orders' : active === 'new' ? 'New print request' : `Welcome back, ${user.name.split(' ')[0]}.`}</h1><p>{active === 'admin' ? 'Review requests, download files, and keep everyone updated.' : active === 'dashboard' ? 'Ready to bring another idea to life?' : active === 'orders' ? 'Everything you have sent, in one place.' : 'Upload a model or send me the link.'}</p></div><div className="account"><UserRound size={19} /><span><strong>{user.name}</strong><small>{user.role}</small></span></div></header>
    {showForm && <NewOrder onCreated={() => { loadOrders(); if (active === 'new') setActive('orders'); }} />}
    {(active === 'dashboard' || active === 'orders') && <Orders orders={active === 'dashboard' ? orders.slice(0, 4) : orders} title={active === 'dashboard' ? 'Recent orders' : 'All orders'} />}
    {active === 'admin' && <><PricingSettings pricing={pricing} onSave={savePricing} /><Orders orders={orders} admin onUpdate={update} title="All print requests" /></>}
  </main></div>;
}
