const WHATSAPP_NUMBER = '5586981560306';
const STORAGE_KEY = 'thecaofeitaria_cart_v1';
const REQUEST_TIMEOUT_MS = 3000;
const PICKUP_ADDRESSES = {
    Centro: 'Rua Rui Barbosa, 677 — Centro (Sul)',
    'Zona Leste': 'Rua Jornalista Alberoni Filho, 575 — Residencial Vila Itália'
};

const els = {
    lista: document.getElementById('lista-pedido'),
    total: document.getElementById('valor-total'),
    entrada: document.getElementById('valor-entrada'),
    avisoCombinar: document.getElementById('aviso-combinar'),
    cartBar: document.getElementById('cart-bar'),
    cartBarCount: document.getElementById('cart-bar-count'),
    cartBarTotal: document.getElementById('cart-bar-total'),
    form: document.getElementById('form-encomenda'),
    enviarBtn: document.getElementById('enviar-pedido'),
    erro: document.getElementById('pedido-erro'),
    honeypot: document.getElementById('website'),
    clienteNome: document.getElementById('cliente-nome'),
    petNome: document.getElementById('pet-nome'),
    dataEntrega: document.getElementById('data-entrega'),
    horarioEntrega: document.getElementById('horario-entrega'),
    localRetirada: document.getElementById('local-retirada'),
    enderecoRetirada: document.getElementById('endereco-retirada'),
    formaPagamento: document.getElementById('forma-pagamento'),
    observacoes: document.getElementById('observacoes')
};

let cart = loadCart();
let isSubmitting = false;

function loadCart() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveCart() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}

function formatBRL(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBR(isoDate) {
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
}

function isSunday(isoDate) {
    if (!isoDate) return false;
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(year, month - 1, day).getDay() === 0;
}

function generateOrderCode() {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `TCF-${dd}${mm}-${rand}`;
}

function changeItem(name, price, aCombinar, minQty, delta) {
    const min = Math.max(1, minQty || 1);
    const index = cart.findIndex((item) => item.name === name);

    if (index === -1 && delta > 0) {
        cart.push({ name, price, qty: min, aCombinar, minQty: min });
    } else if (index !== -1) {
        cart[index].minQty = min;
        cart[index].qty += delta;
        if (cart[index].qty < min) {
            cart.splice(index, 1);
        }
    }

    clearError();
    saveCart();
    render();
}

function removeItem(name) {
    cart = cart.filter((item) => item.name !== name);
    saveCart();
    render();
}

function createStepper(qty, onMinus, onPlus) {
    const stepper = document.createElement('div');
    stepper.className = 'qty-stepper';

    const minusBtn = document.createElement('button');
    minusBtn.type = 'button';
    minusBtn.textContent = '-';
    minusBtn.ariaLabel = 'Diminuir quantidade';
    minusBtn.addEventListener('click', onMinus);

    const qtySpan = document.createElement('span');
    qtySpan.textContent = String(qty);

    const plusBtn = document.createElement('button');
    plusBtn.type = 'button';
    plusBtn.textContent = '+';
    plusBtn.ariaLabel = 'Aumentar quantidade';
    plusBtn.addEventListener('click', onPlus);

    stepper.append(minusBtn, qtySpan, plusBtn);
    return stepper;
}

function renderMenuControls() {
    document.querySelectorAll('.variant-row').forEach((row) => {
        const name = row.dataset.name;
        const price = parseFloat(row.dataset.price || '0');
        const aCombinar = row.dataset.combinar === 'true';
        const minQty = parseInt(row.dataset.min || '1', 10);
        const container = row.querySelector('.qty-control');
        const existing = cart.find((item) => item.name === name);

        container.innerHTML = '';

        if (!existing) {
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'qty-add';
            addBtn.textContent = '+';
            addBtn.ariaLabel = `Adicionar ${name}`;
            addBtn.addEventListener('click', () => changeItem(name, price, aCombinar, minQty, 1));
            container.appendChild(addBtn);
            return;
        }

        container.appendChild(
            createStepper(
                existing.qty,
                () => changeItem(name, price, aCombinar, minQty, -1),
                () => changeItem(name, price, aCombinar, minQty, 1)
            )
        );
    });
}

function renderSummary() {
    els.lista.innerHTML = '';

    if (cart.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'cart-empty';
        empty.textContent = 'Nenhum produto adicionado.';
        els.lista.appendChild(empty);
        els.total.textContent = formatBRL(0);
        els.entrada.textContent = formatBRL(0);
        els.avisoCombinar.hidden = true;
        els.cartBar.hidden = true;
        return;
    }

    let total = 0;
    let totalCount = 0;
    let hasCombinar = false;

    cart.forEach((item) => {
        const subtotal = item.price * item.qty;
        total += subtotal;
        totalCount += item.qty;
        if (item.aCombinar) hasCombinar = true;

        const li = document.createElement('li');
        li.className = 'cart-item';

        const info = document.createElement('div');
        info.className = 'cart-item-info';

        const nameEl = document.createElement('span');
        nameEl.className = 'cart-item-name';
        nameEl.textContent = item.name;

        const priceEl = document.createElement('span');
        priceEl.className = 'cart-item-price';
        priceEl.textContent = item.aCombinar
            ? `${item.qty}x — Valor a combinar`
            : `${item.qty}x ${formatBRL(item.price)} = ${formatBRL(subtotal)}`;

        info.append(nameEl, priceEl);

        const actions = document.createElement('div');
        actions.className = 'cart-actions';

        const stepper = createStepper(
            item.qty,
            () => changeItem(item.name, item.price, item.aCombinar, item.minQty || 1, -1),
            () => changeItem(item.name, item.price, item.aCombinar, item.minQty || 1, 1)
        );

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'Remover';
        removeBtn.addEventListener('click', () => removeItem(item.name));

        actions.append(stepper, removeBtn);
        li.append(info, actions);
        els.lista.appendChild(li);
    });

    els.total.textContent = formatBRL(total);
    els.entrada.textContent = formatBRL(total * 0.5);
    els.avisoCombinar.hidden = !hasCombinar;

    els.cartBarCount.textContent = totalCount === 1 ? '1 item' : `${totalCount} itens`;
    els.cartBarTotal.textContent = formatBRL(total);
    els.cartBar.hidden = false;
}

function render() {
    renderMenuControls();
    renderSummary();
}

function showError(message) {
    els.erro.textContent = message;
    els.erro.hidden = false;
}

function clearError() {
    els.erro.hidden = true;
    els.erro.textContent = '';
}

function buildOrderPayload(code) {
    const total = Number(cart.reduce((sum, item) => sum + item.price * item.qty, 0).toFixed(2));
    const entrada = Number((total * 0.5).toFixed(2));

    return {
        codigo: code,
        cliente_nome: els.clienteNome.value.trim(),
        pet_nome: els.petNome.value.trim() || null,
        data_entrega: els.dataEntrega.value,
        horario_entrega: els.horarioEntrega.value || null,
        local_retirada: els.localRetirada.value,
        forma_pagamento: els.formaPagamento.value,
        itens: cart.map((item) => ({
            nome: item.name,
            quantidade: item.qty,
            preco: item.price,
            a_combinar: Boolean(item.aCombinar)
        })),
        total,
        entrada,
        observacoes: els.observacoes.value.trim() || null,
        status: 'Novo'
    };
}

async function saveOrderToSupabase(payload) {
    const cfg = window.APP_CONFIG || {};
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;

    const baseUrl = cfg.SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
    const headers = {
        apikey: cfg.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
    };

    if (cfg.SUPABASE_ANON_KEY.startsWith('eyJ')) {
        headers.Authorization = `Bearer ${cfg.SUPABASE_ANON_KEY}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const res = await fetch(`${baseUrl}/rest/v1/pedidos`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        if (!res.ok) {
            console.error('Erro ao salvar no Supabase:', res.status, await res.text());
        }
    } catch (err) {
        console.error('Falha de rede ao salvar no Supabase:', err);
    } finally {
        clearTimeout(timer);
    }
}

function buildWhatsAppMessage(payload) {
    const hasCombinar = cart.some((item) => item.aCombinar);

    const itensTexto = cart
        .map((item) => {
            const valor = item.aCombinar ? 'a combinar' : formatBRL(item.price * item.qty);
            return `- ${item.qty}x ${item.name} (${valor})`;
        })
        .join('\n');

    const pickupAddress = PICKUP_ADDRESSES[payload.local_retirada];

    const lines = [
        `*Novo Pedido — Thecãofeitaria (${payload.codigo})*`,
        '',
        `*Cliente:* ${payload.cliente_nome}`,
        payload.pet_nome ? `*Pet:* ${payload.pet_nome}` : null,
        `*Data desejada:* ${formatDateBR(payload.data_entrega)}`,
        payload.horario_entrega ? `*Horário:* ${payload.horario_entrega}` : null,
        `*Retirada:* ${payload.local_retirada}${pickupAddress ? ` (${pickupAddress})` : ''}`,
        `*Pagamento:* ${payload.forma_pagamento}`,
        '',
        '*Itens:*',
        itensTexto,
        '',
        `*Total estimado:* ${formatBRL(payload.total)}${hasCombinar ? ' (+ item a combinar)' : ''}`,
        `*Entrada (50%):* ${formatBRL(payload.entrada)}`
    ].filter((line) => line !== null);

    if (payload.observacoes) {
        lines.push('', `*Observações:* ${payload.observacoes}`);
    }

    return lines.join('\n');
}

async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return;
    if (els.honeypot && els.honeypot.value) return;

    if (cart.length === 0) {
        showError('Adicione pelo menos um produto do cardápio.');
        return;
    }

    if (
        !els.clienteNome.value.trim() ||
        !els.dataEntrega.value ||
        !els.localRetirada.value ||
        !els.formaPagamento.value
    ) {
        showError('Preencha todos os campos obrigatórios (*).');
        return;
    }

    if (isSunday(els.dataEntrega.value)) {
        showError('Atendemos de segunda a sábado. Escolha outra data.');
        return;
    }

    clearError();
    isSubmitting = true;
    els.enviarBtn.disabled = true;
    els.enviarBtn.textContent = 'Enviando...';

    const payload = buildOrderPayload(generateOrderCode());
    await saveOrderToSupabase(payload);

    const text = encodeURIComponent(buildWhatsAppMessage(payload));
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${text}`, '_blank', 'noopener,noreferrer');

    isSubmitting = false;
    els.enviarBtn.disabled = false;
    els.enviarBtn.textContent = 'Enviar pedido pelo WhatsApp';
}

function initMinDate() {
    els.dataEntrega.min = new Date().toISOString().split('T')[0];
    els.dataEntrega.addEventListener('change', () => {
        if (isSunday(els.dataEntrega.value)) {
            showError('Atendemos de segunda a sábado. Escolha outra data.');
            els.dataEntrega.value = '';
        } else {
            clearError();
        }
    });
}

function initPickupAddress() {
    els.localRetirada.addEventListener('change', () => {
        const address = PICKUP_ADDRESSES[els.localRetirada.value];
        els.enderecoRetirada.textContent = address || '';
        els.enderecoRetirada.hidden = !address;
    });
}

els.form.addEventListener('submit', handleSubmit);

initMinDate();
initPickupAddress();
render();
