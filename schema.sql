-- theoneanother admin: run this whole file once in Supabase > SQL Editor

create table products(id bigserial primary key,name text not null,type text not null check(type in('poster','sticker','polaroid','uno')),created_at timestamptz default now());
create table variants(id bigserial primary key,product_id bigint not null references products(id) on delete cascade,name text not null,price int not null check(price>=0),stock int not null default 0 check(stock>=0));
create sequence order_no start 1001;
create table orders(
  id bigserial primary key,
  number text unique default ('TOA-'||nextval('order_no')),
  created_at timestamptz default now(),
  customer_name text not null, phone text not null, email text, address text not null,
  total int not null, pay_amount numeric(10,2), utr text,
  status text not null default 'pending' check(status in('pending','confirmed','shipped','delivered','cancelled')),
  paid boolean not null default false, source text default 'manual', note text);
create table order_items(id bigserial primary key,order_id bigint not null references orders(id) on delete cascade,variant_id bigint references variants(id) on delete set null,product_name text not null,variant_name text not null,qty int not null check(qty>0),price int not null,note text,photos text[] default '{}');
create table settings(key text primary key,value text not null);
create table profiles(id uuid primary key references auth.users(id) on delete cascade,name text,role text not null default 'staff' check(role in('owner','staff')));

create function is_staff() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from profiles where id=auth.uid())$$;
create function is_owner() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from profiles where id=auth.uid() and role='owner')$$;

alter table products enable row level security;
alter table variants enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table settings enable row level security;
alter table profiles enable row level security;

create policy "read products" on products for select using(true);
create policy "staff add products" on products for insert to authenticated with check(is_staff());
create policy "staff edit products" on products for update to authenticated using(is_staff());
create policy "owner delete products" on products for delete to authenticated using(is_owner());
create policy "read variants" on variants for select using(true);
create policy "staff add variants" on variants for insert to authenticated with check(is_staff());
create policy "staff edit variants" on variants for update to authenticated using(is_staff());
create policy "owner delete variants" on variants for delete to authenticated using(is_owner());
create policy "staff read orders" on orders for select to authenticated using(is_staff());
create policy "staff edit orders" on orders for update to authenticated using(is_staff());
create policy "staff read items" on order_items for select to authenticated using(is_staff());
create policy "staff edit items" on order_items for update to authenticated using(is_staff());
create policy "read settings" on settings for select using(true);
create policy "owner add settings" on settings for insert to authenticated with check(is_owner());
create policy "owner edit settings" on settings for update to authenticated using(is_owner());
create policy "read own profile" on profiles for select to authenticated using(id=auth.uid() or is_staff());

-- Shared order logic: validates stock, creates the order and reduces stock in one safe step.
create function make_order(p jsonb,src text,trust boolean) returns text language plpgsql security definer set search_path=public as $$
declare oid bigint; num text; it jsonb; v variants%rowtype; tot int:=0; pn text; q int;
begin
  if coalesce(trim(p->>'name'),'')='' or coalesce(trim(p->>'phone'),'')='' or coalesce(trim(p->>'address'),'')='' then raise exception 'Please fill in name, phone and address'; end if;
  if jsonb_typeof(p->'items')<>'array' or jsonb_array_length(p->'items') not between 1 and 20 then raise exception 'Invalid items'; end if;
  for it in select jsonb_array_elements(p->'items') loop
    q:=(it->>'qty')::int;
    if q<1 or q>100 then raise exception 'Invalid quantity'; end if;
    if not trust and exists(select 1 from jsonb_array_elements_text(coalesce(it->'photos','[]'::jsonb)) ph where ph not like 'uploads/%') then raise exception 'Invalid photo path'; end if;
    select * into v from variants where id=(it->>'variant_id')::bigint;
    if not found or v.stock<q then raise exception 'Not enough stock for an item'; end if;
    tot:=tot+v.price*q;
  end loop;
  if tot<coalesce((select value::int from settings where key='min_order'),249) then raise exception 'Below the minimum order'; end if;
  insert into orders(customer_name,phone,email,address,total,pay_amount,utr,paid,source,note)
  values(trim(p->>'name'),trim(p->>'phone'),nullif(trim(p->>'email'),''),trim(p->>'address'),tot,coalesce(nullif(p->>'pay_amount','')::numeric,tot),nullif(trim(p->>'utr'),''),case when trust then coalesce((p->>'paid')::boolean,false) else false end,src,p->>'note')
  returning id,number into oid,num;
  for it in select jsonb_array_elements(p->'items') loop
    q:=(it->>'qty')::int;
    select * into v from variants where id=(it->>'variant_id')::bigint;
    select name into pn from products where id=v.product_id;
    update variants set stock=stock-q where id=v.id and stock>=q;
    if not found then raise exception 'Not enough stock for an item'; end if;
    insert into order_items(order_id,variant_id,product_name,variant_name,qty,price,note,photos)
    values(oid,v.id,pn,v.name,q,v.price,it->>'note',coalesce(array(select jsonb_array_elements_text(coalesce(it->'photos','[]'::jsonb))),'{}'));
  end loop;
  return num;
end $$;
revoke execute on function make_order(jsonb,text,boolean) from public,anon,authenticated;

-- Staff entering an order from WhatsApp or phone
create function create_order(p jsonb) returns text language plpgsql security definer set search_path=public as $$
begin if not is_staff() then raise exception 'Not allowed'; end if; return make_order(p,'manual',true); end $$;
-- The public store checkout (payment is always marked unverified until staff confirm it)
create function place_order(p jsonb) returns text language plpgsql security definer set search_path=public as $$
begin return make_order(p,'store',false); end $$;
-- Cancel an order and put the stock back (not allowed once shipped)
create function cancel_order(oid bigint) returns void language plpgsql security definer set search_path=public as $$
declare o orders%rowtype; r record;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  select * into o from orders where id=oid for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status='cancelled' then return; end if;
  if o.status in('shipped','delivered') then raise exception 'Shipped or delivered orders cannot be cancelled'; end if;
  for r in select variant_id,sum(qty) as q from order_items where order_id=oid and variant_id is not null group by variant_id loop
    update variants set stock=stock+r.q where id=r.variant_id;
  end loop;
  update orders set status='cancelled' where id=oid;
end $$;
revoke execute on function create_order(jsonb),cancel_order(bigint) from public,anon;
grant execute on function create_order(jsonb),cancel_order(bigint) to authenticated;
grant execute on function place_order(jsonb) to anon,authenticated;

-- Private bucket for customer photos
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('order-photos','order-photos',false,52428800,array['image/jpeg','image/png','application/pdf']) on conflict do nothing;
create policy "staff read photos" on storage.objects for select to authenticated using(bucket_id='order-photos' and is_staff());
create policy "staff upload photos" on storage.objects for insert to authenticated with check(bucket_id='order-photos' and is_staff());
create policy "store upload photos" on storage.objects for insert to anon,authenticated with check(bucket_id='order-photos' and name like 'uploads/%');

-- Starting settings and sample products (edit or delete later in the admin)
insert into settings(key,value) values
('band','Launch offer: free delivery above ₹499|Custom products are non-refundable and non-returnable|Delivery in 5–7 working days'),
('upi','theoneanother@upi'),('wa','917397193050'),('min_order','249'),('low_stock','5');
insert into products(name,type) values('Custom Poster','poster'),('Custom Stickers','sticker'),('Polaroid Set','polaroid'),('Custom UNO Deck','uno');
insert into variants(product_id,name,price,stock) select id,'A4',149,40 from products where name='Custom Poster';
insert into variants(product_id,name,price,stock) select id,'A3',249,25 from products where name='Custom Poster';
insert into variants(product_id,name,price,stock) select id,'Pack of 10',129,50 from products where name='Custom Stickers';
insert into variants(product_id,name,price,stock) select id,'6 photos',149,35 from products where name='Polaroid Set';
insert into variants(product_id,name,price,stock) select id,'10 photos',249,20 from products where name='Polaroid Set';
insert into variants(product_id,name,price,stock) select id,'Standard deck',499,12 from products where name='Custom UNO Deck';

-- AFTER creating the two staff users in Authentication > Users, run these two lines
-- with their real email addresses:
-- insert into profiles(id,name,role) select id,'Owner','owner' from auth.users where email='OWNER_EMAIL';
-- insert into profiles(id,name,role) select id,'Staff','staff' from auth.users where email='STAFF_EMAIL';

-- ===== Part 2: categories, product photos, hidden products, stricter checkout =====
create table if not exists categories(id bigserial primary key,name text not null unique,position int not null default 0);
alter table categories enable row level security;
drop policy if exists "read categories" on categories;
create policy "read categories" on categories for select using(true);
drop policy if exists "staff add categories" on categories;
create policy "staff add categories" on categories for insert to authenticated with check(is_staff());
drop policy if exists "staff edit categories" on categories;
create policy "staff edit categories" on categories for update to authenticated using(is_staff());
drop policy if exists "owner delete categories" on categories;
create policy "owner delete categories" on categories for delete to authenticated using(is_owner());

alter table products add column if not exists category_id bigint references categories(id) on delete set null;
alter table products add column if not exists image text;
alter table products add column if not exists active boolean not null default true;
alter table products drop constraint if exists products_type_check;
alter table products alter column type set default 'poster';
insert into categories(name,position) select v.n,v.p from (values('Posters',1),('Stickers',2),('Polaroids',3),('UNO Cards',4)) v(n,p) where not exists(select 1 from categories);
update products set category_id=(select c.id from categories c where lower(c.name) like case products.type when 'poster' then 'poster%' when 'sticker' then 'sticker%' when 'polaroid' then 'polaroid%' else 'uno%' end order by c.id limit 1) where category_id is null;

-- Hidden products are visible to staff only; staff may remove a size
drop policy if exists "read products" on products;
create policy "read products" on products for select using(active or is_staff());
drop policy if exists "read variants" on variants;
create policy "read variants" on variants for select using(exists(select 1 from products p where p.id=variants.product_id and (p.active or is_staff())));
drop policy if exists "owner delete variants" on variants;
drop policy if exists "staff delete variants" on variants;
create policy "staff delete variants" on variants for delete to authenticated using(is_staff());

-- Public bucket for product photos (staff upload, everyone can view)
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
drop policy if exists "staff add product images" on storage.objects;
create policy "staff add product images" on storage.objects for insert to authenticated with check(bucket_id='product-images' and is_staff());
drop policy if exists "staff edit product images" on storage.objects;
create policy "staff edit product images" on storage.objects for update to authenticated using(bucket_id='product-images' and is_staff());
drop policy if exists "staff delete product images" on storage.objects;
create policy "staff delete product images" on storage.objects for delete to authenticated using(bucket_id='product-images' and is_staff());

-- Shared order logic: validates stock, creates the order and reduces stock in one safe step.
create or replace function make_order(p jsonb,src text,trust boolean) returns text language plpgsql security definer set search_path=public as $$
declare oid bigint; num text; it jsonb; v variants%rowtype; tot int:=0; pn text; q int;
begin
  if coalesce(trim(p->>'name'),'')='' or coalesce(trim(p->>'phone'),'')='' or coalesce(trim(p->>'address'),'')='' then raise exception 'Please fill in name, phone and address'; end if;
  if jsonb_typeof(p->'items')<>'array' or jsonb_array_length(p->'items') not between 1 and 20 then raise exception 'Invalid items'; end if;
  if not trust and (select count(*) from orders where phone=trim(p->>'phone') and source='store' and created_at>now()-interval '1 hour')>=5 then raise exception 'Too many orders from this phone number. Please try again later.'; end if;
  for it in select jsonb_array_elements(p->'items') loop
    q:=(it->>'qty')::int;
    if q<1 or q>100 then raise exception 'Invalid quantity'; end if;
    if not trust and exists(select 1 from jsonb_array_elements_text(coalesce(it->'photos','[]'::jsonb)) ph where ph not like 'uploads/%') then raise exception 'Invalid photo path'; end if;
    select * into v from variants where id=(it->>'variant_id')::bigint;
    if not found or v.stock<q then raise exception 'Not enough stock for an item'; end if;
    if not trust and not exists(select 1 from products where id=v.product_id and active) then raise exception 'An item is no longer available'; end if;
    tot:=tot+v.price*q;
  end loop;
  if tot<coalesce((select value::int from settings where key='min_order'),249) then raise exception 'Below the minimum order'; end if;
  insert into orders(customer_name,phone,email,address,total,pay_amount,utr,paid,source,note)
  values(trim(p->>'name'),trim(p->>'phone'),nullif(trim(p->>'email'),''),trim(p->>'address'),tot,coalesce(nullif(p->>'pay_amount','')::numeric,tot),nullif(trim(p->>'utr'),''),case when trust then coalesce((p->>'paid')::boolean,false) else false end,src,p->>'note')
  returning id,number into oid,num;
  for it in select jsonb_array_elements(p->'items') loop
    q:=(it->>'qty')::int;
    select * into v from variants where id=(it->>'variant_id')::bigint;
    select name into pn from products where id=v.product_id;
    update variants set stock=stock-q where id=v.id and stock>=q;
    if not found then raise exception 'Not enough stock for an item'; end if;
    insert into order_items(order_id,variant_id,product_name,variant_name,qty,price,note,photos)
    values(oid,v.id,pn,v.name,q,v.price,it->>'note',coalesce(array(select jsonb_array_elements_text(coalesce(it->'photos','[]'::jsonb))),'{}'));
  end loop;
  return num;
end $$;

revoke execute on function make_order(jsonb,text,boolean) from public,anon,authenticated;

notify pgrst,'reload schema';
