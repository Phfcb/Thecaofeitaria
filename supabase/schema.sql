create table if not exists public.pedidos (
    id uuid primary key default gen_random_uuid(),
    codigo text not null unique check (char_length(codigo) between 6 and 24),
    cliente_nome text not null check (char_length(trim(cliente_nome)) between 2 and 120),
    pet_nome text check (pet_nome is null or char_length(pet_nome) <= 80),
    data_entrega date not null,
    horario_entrega text check (horario_entrega is null or char_length(horario_entrega) <= 10),
    local_retirada text not null check (local_retirada in ('Centro', 'Zona Leste')),
    forma_pagamento text not null check (forma_pagamento in ('Pix', 'Cartão de crédito', 'Transferência', 'Dinheiro')),
    itens jsonb not null check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) between 1 and 50),
    total numeric(10, 2) not null check (total >= 0 and total <= 100000),
    entrada numeric(10, 2) not null check (entrada >= 0 and entrada <= 100000),
    observacoes text check (observacoes is null or char_length(observacoes) <= 500),
    status text not null default 'Novo' check (status in ('Novo', 'Aguardando 50%', 'Em produção', 'Pronto', 'Entregue', 'Cancelado')),
    created_at timestamptz not null default now()
);

create index if not exists idx_pedidos_data_entrega on public.pedidos (data_entrega);
create index if not exists idx_pedidos_created_at on public.pedidos (created_at desc);

alter table public.pedidos enable row level security;

-- Visitantes podem apenas criar pedidos novos; leitura/edição ficam restritas ao admin autenticado.
drop policy if exists "anon_insert_pedidos" on public.pedidos;
create policy "anon_insert_pedidos"
on public.pedidos
for insert
to anon
with check (
    status = 'Novo'
    and entrada = round((total * 0.5)::numeric, 2)
);

drop policy if exists "auth_select_pedidos" on public.pedidos;
create policy "auth_select_pedidos"
on public.pedidos
for select
to authenticated
using (true);

drop policy if exists "auth_update_pedidos" on public.pedidos;
create policy "auth_update_pedidos"
on public.pedidos
for update
to authenticated
using (true)
with check (true);

-- Tabela interna sem policies públicas: acessada apenas pela RPC smart_keepalive.
create table if not exists public.keepalive (
    id int primary key default 1 check (id = 1),
    last_ping_at timestamptz not null default now()
);

insert into public.keepalive (id) values (1) on conflict (id) do nothing;

alter table public.keepalive enable row level security;

create or replace function public.smart_keepalive()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    last_order timestamptz;
begin
    select max(created_at) into last_order from public.pedidos;

    if last_order is not null and last_order > now() - interval '6 days' then
        return 'skipped_recent_order';
    end if;

    update public.keepalive set last_ping_at = now() where id = 1;
    return 'pinged';
end;
$$;

revoke all on function public.smart_keepalive() from public;
grant execute on function public.smart_keepalive() to anon;
