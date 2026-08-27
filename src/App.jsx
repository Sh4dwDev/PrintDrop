import { useEffect, useState } from 'react';
import { Box, Check, ChevronRight, Clock3, Download, FileBox, Grid2X2, Link2, LogOut, Menu, PackageCheck, Plus, Printer, Save, Send, Settings2, ShieldCheck, Upload, UserRound, X } from 'lucide-react';
import { downloadOrderFile, request } from './api';
import { estimateModelWeight } from './modelWeight';
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

function NewOrder({ onCreated, pricing }) {
  const emptyForm = { name: '', link: '', material: 'PLA', colour: 'Black', quantity: 1, estimatedWeightG: '', weightSource: '', printTimeHours: '', printTimeMinutes: '', notes: '' };
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null); const [weightHint, setWeightHint] = useState('Enter the sliced weight for one print, or upload an STL/OBJ for an estimate.'); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const availableMaterials = pricing?.availableMaterials?.length ? pricing.availableMaterials : MATERIALS;
  const availableColours = pricing?.availableColours?.length ? pricing.availableColours : COLOURS;
  useEffect(() => {
    setForm(current => ({ ...current, material: availableMaterials.includes(current.material) ? current.material : availableMaterials[0], colour: availableColours.includes(current.colour) ? current.colour : availableColours[0] }));
  }, [pricing]);
  async function estimateFile(modelFile, material, quantity) {
    try {
      const unitWeight = await estimateModelWeight(modelFile, material, pricing?.defaultInfillPercent ?? 15);
      setForm(current => ({ ...current, estimatedWeightG: unitWeight.toFixed(1), weightSource: 'file_estimate' }));
      setWeightHint(`Estimated from model geometry at ${pricing?.defaultInfillPercent ?? 15}% infill. You can correct it.`);
    } catch (error) { setWeightHint(error.message); }
  }
  async function chooseFile(modelFile) {
    setFile(modelFile);
    if (!modelFile) { setWeightHint('Enter the sliced weight for one print, or upload an STL/OBJ for an estimate.'); return; }
    await estimateFile(modelFile, form.material, form.quantity);
  }
  async function changeMaterial(material) {
    setForm(current => ({ ...current, material }));
    if (file) await estimateFile(file, material, form.quantity);
  }
  function changeQuantity(quantity) {
    setForm(current => ({ ...current, quantity }));
  }
  async function detectDirectLink() {
    const extension = form.link.split(/[?#]/)[0].split('.').pop()?.toLowerCase();
    if (!['stl', 'obj'].includes(extension)) { if (form.link) setWeightHint('Model pages do not contain slicer weight. Enter the sliced weight if you know it.'); return; }
    try {
      const response = await fetch(form.link);
      if (!response.ok) throw new Error('The model link could not be downloaded.');
      const modelFile = new File([await response.blob()], `linked-model.${extension}`);
      await estimateFile(modelFile, form.material, form.quantity);
    } catch { setWeightHint('That website blocks automatic file reading. Enter the sliced weight manually.'); }
  }
  const quantity = Number(form.quantity || 1);
  const materialRate = Number(pricing?.[`${form.material.toLowerCase()}CostPerKg`] || 0);
  const materialTotal = Number(form.estimatedWeightG || 0) * quantity / 1000 * materialRate;
  const printHours = Number(form.printTimeHours || 0) + Number(form.printTimeMinutes || 0) / 60;
  const machineTotal = printHours * quantity * Number(pricing?.machineRatePerHour || 0);
  const estimatedPrice = (materialTotal + machineTotal) * (1 + Number(pricing?.profitMarginPercent || 0) / 100);
  async function submit(event) {
    event.preventDefault(); setMessage('');
    if (!file && !form.link) return setMessage('Add a file or paste a model link.');
    const body = new FormData(); Object.entries(form).forEach(([key, value]) => body.append(key, value)); if (file) body.append('model', file);
    setBusy(true);
    try { await request('/orders', { method: 'POST', body }); setForm(emptyForm); setFile(null); setWeightHint('Enter the sliced weight for one print, or upload an STL/OBJ for an estimate.'); setMessage('Request sent!'); onCreated(); }
    catch (err) { setMessage(err.message); } finally { setBusy(false); }
  }
  return <form className="request-panel" onSubmit={submit}>
    <h2>What should I print?</h2>
    <div className="source-grid">
      <label className={`dropzone ${file ? 'has-file' : ''}`}><input type="file" accept=".stl,.3mf,.obj,.zip" onChange={e => chooseFile(e.target.files[0] || null)} /><Upload size={28} /><strong>{file ? file.name : 'Upload a file'}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB selected` : 'STL, 3MF, OBJ or ZIP · up to 200 MB'}</span></label>
      <div className="or"><span>OR</span></div>
      <label className="link-field"><strong>Or paste a model link</strong><span className="input-icon"><Link2 size={18} /><input type="url" value={form.link} onChange={e => setForm({ ...form, link: e.target.value })} onBlur={detectDirectLink} placeholder="https://printables.com/model/..." /></span><small>Direct STL/OBJ links are estimated when the website allows it</small></label>
    </div>
    <div className="fields-row">
      <label>Print name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Desk organizer" /></label>
      <label>Material<select value={form.material} onChange={e => changeMaterial(e.target.value)}>{availableMaterials.map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Colour<select value={form.colour} onChange={e => setForm({ ...form, colour: e.target.value })}>{availableColours.map(x => <option key={x}>{x}</option>)}</select></label>
      <label className="quantity">Quantity<input type="number" min="1" max="50" value={form.quantity} onChange={e => changeQuantity(e.target.value)} /></label>
    </div>
    <div className="weight-quote"><label>Estimated weight per print<input type="number" min="0.1" step="0.1" value={form.estimatedWeightG} onChange={e => setForm({ ...form, estimatedWeightG: e.target.value, weightSource: 'customer' })} placeholder="e.g. 80" /><small>{weightHint}</small></label><div className="time-field"><strong>Print time per print</strong><span><label>Hours<input type="number" min="0" step="1" value={form.printTimeHours} onChange={e => setForm({ ...form, printTimeHours: e.target.value })} placeholder="2" /></label><label>Minutes<input type="number" min="0" max="59" step="1" value={form.printTimeMinutes} onChange={e => setForm({ ...form, printTimeMinutes: e.target.value })} placeholder="30" /></label></span><small>Copy this from your slicer if known.</small></div><div className="quote-preview"><small>Estimated price · {form.quantity || 1}× print</small><strong>{pricing && (form.estimatedWeightG || printHours) ? `${estimatedPrice.toFixed(2)} kr` : '—'}</strong><small>{materialTotal.toFixed(2)} material + {machineTotal.toFixed(2)} time</small></div></div>
    <div className="notes-submit"><label>Notes<textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Size, strength, deadline, or anything else I should know…" /></label><button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Submit request'}<Send size={17} /></button></div>
    {message && <div className={`notice ${message.includes('sent') ? 'success' : 'error'}`}>{message}</div>}
  </form>;
}

function PriceEditor({ order, onUpdate }) {
  return <label className="weight-editor">
    <span className="sr-only">Estimated weight per print in grams</span>
    <span className="weight-input"><input type="number" min="0.1" step="0.1" defaultValue={order.estimatedWeightG || ''} placeholder="0" onBlur={event => {
      const value = event.target.value ? Number(event.target.value) : null;
      if (value !== Number(order.estimatedWeightG || 0)) onUpdate(order.id, { estimatedWeightG: value });
    }} /><small>g</small></span>
  </label>;
}

function PrintTimeEditor({ order, onUpdate }) {
  return <label className="weight-editor">
    <span className="sr-only">Print time per print in hours</span>
    <span className="weight-input"><input type="number" min="0.1" step="0.1" defaultValue={order.estimatedPrintTimeMinutes ? (Number(order.estimatedPrintTimeMinutes) / 60).toFixed(2) : ''} placeholder="0" onBlur={event => {
      const minutes = event.target.value ? Math.round(Number(event.target.value) * 60) : null;
      if (minutes !== Number(order.estimatedPrintTimeMinutes || 0)) onUpdate(order.id, { estimatedPrintTimeMinutes: minutes });
    }} /><small>h</small></span>
  </label>;
}

function PricingSettings({ pricing, onSave }) {
  const [form, setForm] = useState(pricing);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(pricing), [pricing]);
  if (!form) return null;
  const petgCost = 80 / 1000 * Number(form.petgCostPerKg || 0);
  const exampleMachineCost = 2 * Number(form.machineRatePerHour || 0);
  const petgProfit = (petgCost + exampleMachineCost) * Number(form.profitMarginPercent || 0) / 100;
  function change(key, value) { setForm(current => ({ ...current, [key]: value })); }
  function toggleStock(key, item) { setForm(current => ({ ...current, [key]: current[key].includes(item) ? current[key].filter(value => value !== item) : [...current[key], item] })); }
  async function submit(event) {
    event.preventDefault(); setMessage(''); setBusy(true);
    if (!form.availableMaterials.length || !form.availableColours.length) { setMessage('Keep at least one material and one colour in stock.'); setBusy(false); return; }
    try { await onSave(form); setMessage('Pricing and inventory saved.'); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  const materials = [['plaCostPerKg', 'PLA'], ['petgCostPerKg', 'PETG'], ['tpuCostPerKg', 'TPU'], ['absCostPerKg', 'ABS']];
  return <form className="pricing-panel" onSubmit={submit}>
    <div className="pricing-heading"><span className="settings-icon"><Settings2 size={20} /></span><div><h2>Pricing settings</h2><p>Set your material cost and the profit added on top.</p></div></div>
    <div className="pricing-fields">
      {materials.map(([key, label]) => <label key={key}>{label} cost<input required type="number" min="0" step="1" value={form[key]} onChange={event => change(key, event.target.value)} /><small>kr per kg</small></label>)}
      <label>Profit margin<input required type="number" min="0" max="1000" step="0.1" value={form.profitMarginPercent} onChange={event => change('profitMarginPercent', event.target.value)} /><small>% added to material + time</small></label>
      <label>Default infill<input required type="number" min="0" max="100" step="1" value={form.defaultInfillPercent} onChange={event => change('defaultInfillPercent', event.target.value)} /><small>% for file estimates</small></label>
      <label>Machine time<input required type="number" min="0" step="0.5" value={form.machineRatePerHour} onChange={event => change('machineRatePerHour', event.target.value)} /><small>kr per print hour</small></label>
    </div>
    <div className="inventory-settings"><div><strong>Materials in stock</strong><span>{MATERIALS.map(material => <label className="stock-toggle" key={material}><input type="checkbox" checked={form.availableMaterials.includes(material)} onChange={() => toggleStock('availableMaterials', material)} /><span>{material}</span></label>)}</span></div><div><strong>Colours in stock</strong><span>{COLOURS.map(colour => <label className="stock-toggle" key={colour}><input type="checkbox" checked={form.availableColours.includes(colour)} onChange={() => toggleStock('availableColours', colour)} /><span>{colour}</span></label>)}</span></div></div>
    <div className="price-example"><div><small>Example · 80 g PETG · 2 hours</small><strong>{petgCost.toFixed(2)} material + {exampleMachineCost.toFixed(2)} time + {petgProfit.toFixed(2)} profit</strong></div><span>{(petgCost + exampleMachineCost + petgProfit).toFixed(2)} kr</span></div>
    <div className="pricing-actions">{message && <span className={message.includes('saved') ? 'saved' : 'save-error'}>{message}</span>}<button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save pricing & stock'}<Save size={17} /></button></div>
  </form>;
}

function Orders({ orders, admin, onUpdate, title = 'Recent orders' }) {
  if (!orders.length) return <section className="orders-panel"><div className="section-head"><h2>{title}</h2></div><div className="empty"><FileBox size={28} /><strong>No print requests yet</strong><span>Your submitted orders will show up here.</span></div></section>;
  return <section className="orders-panel"><div className="section-head"><h2>{title}</h2><div className="section-meta">{admin && <strong>Enter sliced weight to calculate</strong>}<span>{orders.length} {orders.length === 1 ? 'request' : 'requests'}</span></div></div><div className="order-list">
    <div className={`order-row order-head ${admin ? 'admin-row' : ''}`}><span>Order</span><span>Print</span>{admin && <span>Requested by</span>}<span>Material</span>{admin && <span>Weight each</span>}{admin && <span>Time each</span>}{admin && <span>Costs</span>}<span>Price</span><span>Status</span><span>Updated</span><span /></div>
    {orders.map(order => { const Icon = statusIcons[order.status] || Clock3; return <div className={`order-row ${admin ? 'admin-row' : ''}`} key={order.id}>
      <span className="order-id"><FileBox size={18} />#{order.id.slice(-6).toUpperCase()}</span><span><strong>{order.name}</strong><small>{order.colour} · Qty {order.quantity}</small></span>{admin && <span><strong>{order.userName}</strong><small>{order.userEmail}</small></span>}<span>{order.material}</span>
      {admin && <span><PriceEditor order={order} onUpdate={onUpdate} />{order.weightSource && <small className="weight-source">{order.weightSource === 'file_estimate' ? 'File estimate' : order.weightSource === 'admin' ? 'Admin verified' : 'Customer entered'}</small>}</span>}{admin && <span><PrintTimeEditor order={order} onUpdate={onUpdate} />{order.printTimeSource && <small className="weight-source">{order.printTimeSource === 'admin' ? 'Admin verified' : 'Customer entered'}</small>}</span>}{admin && <span className="price-breakdown">{order.materialCostNok || order.machineCostNok ? <><strong>{Number(order.materialCostNok || 0).toFixed(2)} material</strong><small>+ {Number(order.machineCostNok || 0).toFixed(2)} time</small><small>+ {Number(order.profitAmountNok || 0).toFixed(2)} profit</small></> : '—'}</span>}<span className="price">{order.quotedPriceNok ? `${Number(order.quotedPriceNok).toFixed(2)} kr` : '—'}</span>
      <span>{admin ? <select className={`status ${order.status.toLowerCase()}`} value={order.status} onChange={e => onUpdate(order.id, { status: e.target.value })}>{STATUSES.map(x => <option key={x}>{x}</option>)}</select> : <span className={`status ${order.status.toLowerCase()}`}><Icon size={15} />{order.status}</span>}</span>
      <span>{new Date(order.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><span className="actions">{order.fileName && <button title="Download model file" onClick={() => downloadOrderFile(order)}><Download size={18} /></button>}{order.link && <a title="Open model link" href={order.link} target="_blank" rel="noreferrer"><ChevronRight size={19} /></a>}</span>
    </div>; })}</div></section>;
}

export function App() {
  const [user, setUser] = useState(null); const [loading, setLoading] = useState(true); const [orders, setOrders] = useState([]); const [pricing, setPricing] = useState(null); const [pricingError, setPricingError] = useState(''); const [active, setActive] = useState('dashboard'); const [menu, setMenu] = useState(false);
  async function loadOrders(currentUser = user) { if (!currentUser) return; try { setOrders((await request(currentUser.role === 'admin' && active === 'admin' ? '/admin/orders' : '/orders')).orders); } catch {} }
  useEffect(() => { if (!isConfigured) { setLoading(false); return; } request('/auth/me').then(x => setUser(x.user)).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(() => { loadOrders(); }, [user, active]);
  useEffect(() => { if (!user) return; setPricingError(''); request('/pricing').then(result => setPricing(result.pricing)).catch(error => setPricingError(error.message)); }, [user]);
  async function logout() { await request('/auth/logout'); setUser(null); }
  async function update(id, changes) { await request(`/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }); loadOrders(); }
  async function savePricing(changes) { const result = await request('/admin/pricing', { method: 'PATCH', body: JSON.stringify(changes) }); setPricing(result.pricing); loadOrders(); }
  if (!isConfigured) return <main className="setup-page"><Logo /><section><h1>Connect Supabase</h1><p>Add these two environment variables to run PrintDrop:</p><code>VITE_SUPABASE_URL</code><code>VITE_SUPABASE_PUBLISHABLE_KEY</code><p className="setup-note">Then run <strong>supabase/schema.sql</strong> in your Supabase SQL Editor.</p></section></main>;
  if (loading) return <div className="loader"><Printer className="spin" /> Loading PrintDrop…</div>;
  if (!user) return <Auth onAuth={setUser} />;
  const showForm = active === 'dashboard' || active === 'new';
  return <div className="app-shell"><Sidebar active={active} setActive={setActive} user={user} logout={logout} open={menu} close={() => setMenu(false)} /><main className="content">
    <header><button className="menu-button" onClick={() => setMenu(true)}><Menu /></button><div><h1>{active === 'admin' ? 'Print queue' : active === 'orders' ? 'My orders' : active === 'new' ? 'New print request' : `Welcome back, ${user.name.split(' ')[0]}.`}</h1><p>{active === 'admin' ? 'Review requests, download files, and keep everyone updated.' : active === 'dashboard' ? 'Ready to bring another idea to life?' : active === 'orders' ? 'Everything you have sent, in one place.' : 'Upload a model or send me the link.'}</p></div><div className="account"><UserRound size={19} /><span><strong>{user.name}</strong><small>{user.role}</small></span></div></header>
    {showForm && <NewOrder pricing={pricing} onCreated={() => { loadOrders(); if (active === 'new') setActive('orders'); }} />}
    {(active === 'dashboard' || active === 'orders') && <Orders orders={active === 'dashboard' ? orders.slice(0, 4) : orders} title={active === 'dashboard' ? 'Recent orders' : 'All orders'} />}
    {active === 'admin' && <>{pricingError && <div className="notice error settings-error">Pricing settings could not load: {pricingError}. Run the latest Supabase migration.</div>}<PricingSettings pricing={pricing} onSave={savePricing} /><Orders orders={orders} admin onUpdate={update} title="All print requests" /></>}
  </main></div>;
}
