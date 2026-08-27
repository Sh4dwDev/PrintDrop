import { supabase } from './supabase';

function mapOrder(row) {
  return { id: row.id, userId: row.user_id, userName: row.user_name, userEmail: row.user_email, name: row.name, link: row.model_link, material: row.material, colour: row.colour, quantity: row.quantity, notes: row.notes, fileName: row.file_name, filePath: row.file_path, estimatedWeightG: row.estimated_weight_g, weightSource: row.weight_source, materialCostNok: row.material_cost_nok, profitAmountNok: row.profit_amount_nok, quotedPriceNok: row.quoted_price_nok, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapPricing(row) {
  return { plaCostPerKg: row.pla_cost_per_kg, petgCostPerKg: row.petg_cost_per_kg, tpuCostPerKg: row.tpu_cost_per_kg, absCostPerKg: row.abs_cost_per_kg, profitMarginPercent: row.profit_margin_percent, defaultInfillPercent: row.default_infill_percent, availableMaterials: row.available_materials || ['PLA', 'PETG', 'TPU', 'ABS'], availableColours: row.available_colours || ['Black', 'White', 'Grey', 'Orange', 'Blue', 'Green', 'Other'] };
}

async function currentUser() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Please sign in again.');
  const { data: profile, error } = await supabase.from('profiles').select('id,name,email,role').eq('id', authData.user.id).single();
  if (error) throw error;
  return profile;
}

export async function request(path, options = {}) {
  if (path === '/auth/register') {
    const body = JSON.parse(options.body);
    const { data, error } = await supabase.auth.signUp({ email: body.email, password: body.password, options: { data: { name: body.name } } });
    if (error) throw error;
    if (!data.session) return { needsConfirmation: true };
    return { user: await currentUser() };
  }
  if (path === '/auth/login') {
    const body = JSON.parse(options.body);
    const { error } = await supabase.auth.signInWithPassword({ email: body.email, password: body.password });
    if (error) throw error;
    return { user: await currentUser() };
  }
  if (path === '/auth/me') return { user: await currentUser() };
  if (path === '/auth/logout') { await supabase.auth.signOut(); return {}; }
  if (path === '/pricing' && !options.method) {
    const { data, error } = await supabase.from('pricing_settings').select('*').eq('id', true).single();
    if (error) throw error;
    return { pricing: mapPricing(data) };
  }
  if (path === '/admin/pricing' && options.method === 'PATCH') {
    const changes = JSON.parse(options.body);
    const update = {
      pla_cost_per_kg: Number(changes.plaCostPerKg), petg_cost_per_kg: Number(changes.petgCostPerKg),
      tpu_cost_per_kg: Number(changes.tpuCostPerKg), abs_cost_per_kg: Number(changes.absCostPerKg),
      profit_margin_percent: Number(changes.profitMarginPercent), default_infill_percent: Number(changes.defaultInfillPercent), available_materials: changes.availableMaterials, available_colours: changes.availableColours, updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from('pricing_settings').update(update).eq('id', true).select().single();
    if (error) throw error;
    const { error: recalculateError } = await supabase.from('orders').update({ updated_at: new Date().toISOString() }).not('estimated_weight_g', 'is', null);
    if (recalculateError) throw recalculateError;
    return { pricing: mapPricing(data) };
  }
  if (path === '/orders' && options.method === 'POST') {
    const form = options.body; const user = await currentUser(); const file = form.get('model'); let filePath = null;
    if (file?.size) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      filePath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await supabase.storage.from('print-files').upload(filePath, file, { contentType: file.type || 'application/octet-stream' });
      if (error) throw error;
    }
    const weight = Number(form.get('estimatedWeightG'));
    const row = { user_id: user.id, user_name: user.name, user_email: user.email, name: form.get('name'), model_link: form.get('link') || null, material: form.get('material'), colour: form.get('colour'), quantity: Number(form.get('quantity')), notes: form.get('notes') || null, file_name: file?.size ? file.name : null, file_path: filePath, estimated_weight_g: weight > 0 ? weight : null, weight_source: weight > 0 ? (form.get('weightSource') || 'customer') : null };
    const { data, error } = await supabase.from('orders').insert(row).select().single();
    if (error) { if (filePath) await supabase.storage.from('print-files').remove([filePath]); throw error; }
    return { order: mapOrder(data) };
  }
  if ((path === '/orders' || path === '/admin/orders') && !options.method) {
    const user = await currentUser();
    if (path === '/admin/orders' && user.role !== 'admin') throw new Error('Admin access required.');
    let query = supabase.from('orders').select('*');
    if (path === '/orders') query = query.eq('user_id', user.id);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return { orders: data.map(mapOrder) };
  }
  if (path.startsWith('/admin/orders/') && options.method === 'PATCH') {
    const id = path.split('/').pop(); const changes = JSON.parse(options.body); const update = { updated_at: new Date().toISOString() };
    if (changes.status !== undefined) update.status = changes.status;
    if (changes.estimatedWeightG !== undefined) { update.estimated_weight_g = changes.estimatedWeightG || null; update.weight_source = changes.estimatedWeightG ? 'admin' : null; }
    const { data, error } = await supabase.from('orders').update(update).eq('id', id).select().single();
    if (error) throw error;
    return { order: mapOrder(data) };
  }
  throw new Error('Unknown request.');
}

export async function downloadOrderFile(order) {
  if (!order.filePath) return;
  const { data, error } = await supabase.storage.from('print-files').createSignedUrl(order.filePath, 60, { download: order.fileName });
  if (error) throw error;
  const link = document.createElement('a');
  link.href = data.signedUrl;
  link.download = order.fileName;
  link.rel = 'noopener noreferrer';
  link.click();
}
