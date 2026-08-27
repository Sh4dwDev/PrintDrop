# PrintDrop

A small 3D print ordering app for friends. Users can create accounts, upload STL/3MF/OBJ/ZIP files or paste model links, and track status. The first registered account is the admin and can download files and update every order.

## 1. Set up Supabase

1. Create a Supabase project.
2. Open **SQL Editor**, paste all of `supabase/schema.sql`, and run it once.
3. In **Project Settings → API**, copy the Project URL and publishable key.
4. Copy `.env.example` to `.env.local` and add those two values.

## 2. Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The first account you register gets admin access; every later account is a customer.

## 3. Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Vercel should detect **Vite** automatically.
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the Vercel project's **Settings → Environment Variables**.
5. Deploy.

In Supabase, add the final Vercel URL to **Authentication → URL Configuration → Site URL**. If email confirmation is enabled, also add it to the redirect URL list.

## Pricing

The admin view includes pricing settings for each material and a profit margin. Defaults are **300 kr/kg** and **15%**. Enter the total sliced weight on an order to see the material cost, profit, and customer price.

For an existing database, run `supabase/migrations/005_complete_pricing_and_weight.sql` once in the Supabase SQL Editor. It includes the earlier pricing and privacy upgrades too.

If you already ran migration 005 before stock controls were added, run `supabase/migrations/006_add_stock_controls.sql` once. Admins can then toggle available materials and colours; customers only see in-stock choices.

Customers can enter the total sliced weight themselves. STL and OBJ uploads get a rough automatic estimate using model volume, material density, and the admin's default infill setting. The estimate remains editable because final weight depends on slicer settings. Direct STL/OBJ links are estimated when the source website permits browser access; ordinary Printables, Thingiverse, and MakerWorld pages cannot expose a reliable sliced weight.

## Security and storage

The browser only receives Supabase's publishable key. Row Level Security keeps customer orders private, while the admin can see all requests. The `print-files` bucket is private and downloads use short-lived signed links.
