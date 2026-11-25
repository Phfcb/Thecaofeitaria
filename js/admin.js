const SESSION_KEY = 'thecaofeitaria_admin_session_v1';
const STATUS_OPTIONS = [
    'Novo',
    'Aguardando 50%',
    'Em produção',
    'Pronto',
    'Entregue',
    'Cancelado'
];

const els = {
    loginView: document.getElementById('login-view'),
    passwordView: document.getElementById('password-view'),
    ordersView: document.getElementById('orders-view'),
    loginForm: document.getElementById('login-form'),
    loginEmail: document.getElementById('login-email'),
    loginPassword: document.getElementById('login-password'),
    loginErro: document.getElementById('login-erro'),
    btnLogin: document.getElementById('btn-login'),
    btnOpenPassword: document.getElementById('btn-open-password'),
    btnLogout: document.getElementById('btn-logout'),
    passwordForm: document.getElementById('password-form'),
    newPassword: document.getElementById('new-password'),
    confirmPassword: document.getElementById('confirm-password'),
    passwordMsg: document.getElementById('password-msg'),
    btnSavePassword: document.getElementById('btn-save-password'),
    btnCancelPassword: document.getElementById('btn-cancel-password'),
    btnRefresh: document.getElementById('btn-refresh'),
    searchInput: document.getElementById('search-input'),
    ordersStatus: document.getElementById('orders-status'),
    ordersList: document.getElementById('orders-list')
};

let allOrders = [];
let currentFilter = 'ativos';

function getConfig() {
    const cfg = window.APP_CONFIG || {};
    return {
        url: (cfg.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, ''),
        anonKey: cfg.SUPABASE_ANON_KEY || ''
    };
}

function getSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

function formatBRL(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBR(isoDate) {
    if (!isoDate) return '-';
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
}

function showLoginError(msg) {
    els.loginErro.textContent = msg;
    els.loginErro.hidden = false;
}

function setPasswordMsg(msg, isSuccess = false) {
    els.passwordMsg.className = isSuccess ? 'success-msg' : 'error-msg';
    els.passwordMsg.textContent = msg;
    els.passwordMsg.hidden = !msg;
}

function setStatusMsg(msg) {
    els.ordersStatus.textContent = msg;
    els.ordersStatus.hidden = !msg;
}

function showView(view) {
    const logged = view !== 'login';
    els.loginView.hidden = view !== 'login';
    els.ordersView.hidden = view !== 'orders';
    els.passwordView.hidden = view !== 'password';
    els.btnLogout.hidden = !logged;
    els.btnOpenPassword.hidden = !logged;
}

async function authHeaders() {
    const { anonKey } = getConfig();
    const session = getSession();
    return {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
    };
}

async function handleLogin(event) {
    event.preventDefault();
    els.loginErro.hidden = true;

    const { url, anonKey } = getConfig();
    if (!url || !anonKey) {
        showLoginError('Supabase não configurado em js/config.js.');
        return;
    }

    els.btnLogin.disabled = true;
    els.btnLogin.textContent = 'Entrando...';

    try {
        const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: {
                apikey: anonKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: els.loginEmail.value.trim(),
                password: els.loginPassword.value
            })
        });

        const data = await res.json();
        if (!res.ok) {
            showLoginError('E-mail ou senha inválidos.');
            return;
        }

        saveSession({ access_token: data.access_token, user: data.user?.email || '' });
        els.loginForm.reset();
        showView('orders');
        await fetchOrders();
    } catch {
        showLoginError('Erro de conexão. Tente novamente.');
    } finally {
        els.btnLogin.disabled = false;
        els.btnLogin.textContent = 'Entrar';
    }
}

function handleLogout() {
    clearSession();
    allOrders = [];
    els.ordersList.innerHTML = '';
    showView('login');
}

async function handlePasswordUpdate(event) {
    event.preventDefault();
    setPasswordMsg('');

    const pwd = els.newPassword.value;
    if (pwd.length < 6) {
        setPasswordMsg('A senha deve ter pelo menos 6 caracteres.');
        return;
    }

    if (pwd !== els.confirmPassword.value) {
        setPasswordMsg('As senhas não conferem.');
        return;
    }

    const { url } = getConfig();
    els.btnSavePassword.disabled = true;
    els.btnSavePassword.textContent = 'Salvando...';

    try {
        const res = await fetch(`${url}/auth/v1/user`, {
            method: 'PUT',
            headers: await authHeaders(),
            body: JSON.stringify({ password: pwd })
        });

        if (res.status === 401) {
            handleLogout();
            showLoginError('Sua sessão expirou. Entre novamente.');
            return;
        }

        if (!res.ok) {
            setPasswordMsg('Não foi possível alterar a senha.');
            return;
        }

        els.passwordForm.reset();
        setPasswordMsg('Senha alterada com sucesso!', true);
    } catch {
        setPasswordMsg('Erro de conexão. Tente novamente.');
    } finally {
        els.btnSavePassword.disabled = false;
        els.btnSavePassword.textContent = 'Salvar senha';
    }
}

async function fetchOrders() {
    const { url } = getConfig();
    setStatusMsg('Carregando pedidos...');

    try {
        const res = await fetch(
            `${url}/rest/v1/pedidos?select=*&order=data_entrega.asc,created_at.desc`,
            { headers: await authHeaders() }
        );

        if (res.status === 401) {
            handleLogout();
            showLoginError('Sua sessão expirou. Entre novamente.');
            return;
        }

        if (!res.ok) {
            setStatusMsg('Não foi possível carregar os pedidos.');
            return;
        }

        allOrders = await res.json();
        setStatusMsg('');
        renderOrders();
    } catch {
        setStatusMsg('Erro de conexão ao buscar pedidos.');
    }
}

async function updateOrderStatus(id, newStatus) {
    const { url } = getConfig();
    const res = await fetch(`${url}/rest/v1/pedidos?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ status: newStatus })
    });

    if (res.status === 401) {
        handleLogout();
        return;
    }

    if (res.ok) {
        const target = allOrders.find((o) => o.id === id);
        if (target) target.status = newStatus;
        renderOrders();
    }
}

async function deleteOrder(id, codigo) {
    if (!confirm(`Excluir o pedido ${codigo}? Essa ação não pode ser desfeita.`)) {
        return;
    }

    const { url } = getConfig();
    const res = await fetch(`${url}/rest/v1/pedidos?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: await authHeaders()
    });

    if (res.status === 401) {
        handleLogout();
        return;
    }

    if (res.ok) {
        allOrders = allOrders.filter((o) => o.id !== id);
        renderOrders();
    }
}

function filterOrders() {
    const query = els.searchInput.value.trim().toLowerCase();

    return allOrders.filter((order) => {
        if (currentFilter === 'ativos' && (order.status === 'Entregue' || order.status === 'Cancelado')) {
            return false;
        }
        if (currentFilter === 'entregues' && order.status !== 'Entregue') {
            return false;
        }

        if (!query) return true;
        return (
            order.cliente_nome.toLowerCase().includes(query) ||
            order.codigo.toLowerCase().includes(query)
        );
    });
}

function createTextEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = text;
    return el;
}

function renderOrderCard(order) {
    const card = document.createElement('article');
    card.className = 'order-card';

    const top = document.createElement('div');
    top.className = 'order-top';

    const leftTop = document.createElement('div');
    leftTop.append(
        createTextEl('div', 'order-code', order.codigo),
        createTextEl(
            'div',
            'order-date',
            `${formatDateBR(order.data_entrega)}${order.horario_entrega ? ` às ${order.horario_entrega}` : ''}`
        )
    );

    const localBadge = createTextEl('span', 'order-code', order.local_retirada);
    top.append(leftTop, localBadge);

    const cliente = createTextEl('div', 'order-meta', '');
    const nomeStrong = document.createElement('strong');
    nomeStrong.textContent = order.cliente_nome;
    cliente.append(nomeStrong);
    if (order.pet_nome) {
        cliente.append(` · Pet: ${order.pet_nome}`);
    }

    const pagamento = createTextEl('div', 'order-meta', `Pagamento: ${order.forma_pagamento}`);

    const itemsList = document.createElement('ul');
    itemsList.className = 'order-items';
    (order.itens || []).forEach((item) => {
        const li = document.createElement('li');
        li.textContent = `${item.quantidade}x ${item.nome}`;
        itemsList.appendChild(li);
    });

    card.append(top, cliente, pagamento, itemsList);

    if (order.observacoes) {
        card.appendChild(createTextEl('div', 'order-obs', `Obs.: ${order.observacoes}`));
    }

    const values = document.createElement('div');
    values.className = 'order-values';
    values.append(
        createTextEl('span', '', `Total: ${formatBRL(order.total)}`),
        createTextEl('strong', '', `Entrada 50%: ${formatBRL(order.entrada)}`)
    );

    const actions = document.createElement('div');
    actions.className = 'order-actions';

    const select = document.createElement('select');
    select.className = 'status-select';
    select.ariaLabel = `Status do pedido ${order.codigo}`;
    STATUS_OPTIONS.forEach((st) => {
        const opt = document.createElement('option');
        opt.value = st;
        opt.textContent = st;
        if (order.status === st) opt.selected = true;
        select.appendChild(opt);
    });
    select.addEventListener('change', () => updateOrderStatus(order.id, select.value));

    const delBtn = createTextEl('button', 'btn-delete', 'Excluir');
    delBtn.type = 'button';
    delBtn.addEventListener('click', () => deleteOrder(order.id, order.codigo));

    actions.append(select, delBtn);
    card.append(values, actions);
    return card;
}

function renderOrders() {
    els.ordersList.innerHTML = '';
    const filtered = filterOrders();

    if (filtered.length === 0) {
        setStatusMsg('Nenhum pedido encontrado.');
        return;
    }

    setStatusMsg('');
    filtered.forEach((order) => {
        els.ordersList.appendChild(renderOrderCard(order));
    });
}

function initTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.filter;
            renderOrders();
        });
    });
}

function handleRecoveryHash() {
    if (!window.location.hash) return false;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get('access_token');
    const type = params.get('type');

    if (accessToken && type === 'recovery') {
        saveSession({ access_token: accessToken, user: '' });
        history.replaceState(null, '', window.location.pathname);
        return true;
    }

    return false;
}

els.loginForm.addEventListener('submit', handleLogin);
els.passwordForm.addEventListener('submit', handlePasswordUpdate);
els.btnOpenPassword.addEventListener('click', () => {
    setPasswordMsg('');
    showView('password');
});
els.btnCancelPassword.addEventListener('click', () => {
    showView('orders');
    if (allOrders.length === 0) fetchOrders();
});
els.btnLogout.addEventListener('click', handleLogout);
els.btnRefresh.addEventListener('click', fetchOrders);
els.searchInput.addEventListener('input', renderOrders);

initTabs();

if (handleRecoveryHash()) {
    showView('password');
} else if (getSession()?.access_token) {
    showView('orders');
    fetchOrders();
} else {
    showView('login');
}
