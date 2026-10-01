// ============================================================
// PAINEL ADMIN — Torneio de Robôs (banco local via servidor)
// ============================================================

const CATEGORIA = new URLSearchParams(location.search).get('cat') || 'geral';
const INTERVALO_MIN = 40;    // minutos mínimos entre duas lutas do mesmo robô
const DURACAO_LUTA = 15;     // duração estimada de uma luta (para gerar agenda)

let competidores = [];
let lutas = {};
let ultimaAtualizacao = null;

// ============================================================
// CAMADA DE DADOS (API local)
// ============================================================
async function carregarEstado() {
    try {
        const res = await fetch('/api/torneio/' + encodeURIComponent(CATEGORIA), { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const dados = await res.json();
        if (dados.atualizadoEm === ultimaAtualizacao) return; // nada mudou
        ultimaAtualizacao = dados.atualizadoEm;
        competidores = dados.competidores || [];
        lutas = dados.lutas || {};
        renderizarCompetidores();
        if (document.getElementById('tab-agenda').classList.contains('active')) renderizarAgenda();
        if (document.getElementById('tab-chaveamento').classList.contains('active')) renderizarChaveamento();
    } catch (erro) {
        console.error('Erro ao carregar estado:', erro);
    }
}

async function salvarEstado() {
    try {
        const res = await fetch('/api/torneio/' + encodeURIComponent(CATEGORIA), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ competidores, lutas })
        });
        if (res.status === 401) {
            // sessão expirada: volta para a tela de login
            location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search);
            throw new Error('login necessário');
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        ultimaAtualizacao = (await fetch('/api/torneio/' + encodeURIComponent(CATEGORIA), { cache: 'no-store' })
            .then(r => r.json()).catch(() => ({}))).atualizadoEm || ultimaAtualizacao;
    } catch (erro) {
        if (erro.message === 'login necessário') return;
        console.error('Erro ao salvar:', erro);
        alert('Erro ao salvar no servidor: ' + erro.message);
        throw erro;
    }
}

// Polling para manter sincronizado (admin aberto em mais de uma tela)
function sincronizarBanco() {
    carregarEstado();
    setInterval(carregarEstado, 3000);
}

// ============================================================
// ABAS
// ============================================================
window.mudarAba = function(abaId, e) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav button').forEach(el => el.classList.remove('active'));

    document.getElementById(`tab-${abaId}`).classList.add('active');
    if (e && e.target) e.target.classList.add('active');

    if (abaId === 'agenda') renderizarAgenda();
    if (abaId === 'chaveamento') {
        renderizarChaveamento();
        setTimeout(desenharLinhas, 100);
    }
}

// ============================================================
// COMPETIDORES
// ============================================================
function renderizarCompetidores() {
    const tbody = document.getElementById('tabela-competidores');
    if (!tbody) return;
    tbody.innerHTML = '';
    competidores.forEach((comp, index) => {
        tbody.innerHTML += `
            <tr>
                <td>${index + 1}</td>
                <td>${comp.nome}</td>
                <td>${comp.equipe || '-'}</td>
                <td>${comp.categoria || '12'}</td>
                <td><button class="btn-danger" onclick="excluirCompetidor(${index})">Excluir</button></td>
            </tr>
        `;
    });
}

document.getElementById('btnAdicionar').addEventListener('click', async () => {
    const nome = document.getElementById('nomeRobo').value.trim();
    if (!nome) return alert('Digite o nome do robô!');

    competidores.push({
        nome,
        equipe: document.getElementById('equipe').value || '-',
        categoria: document.getElementById('categoria').value || '12'
    });
    document.getElementById('nomeRobo').value = '';
    document.getElementById('equipe').value = '';
    await salvarEstado();
    renderizarCompetidores();
});

window.excluirCompetidor = async function(index) {
    competidores.splice(index, 1);
    await salvarEstado();
    renderizarCompetidores();
};

// ============================================================
// INICIAR TORNEIO (genérico: 16 / 32 / 64 vagas)
// ============================================================
const WID = (r, i) => `W${r}_${i}`;
const LID = (r, i) => `L${r}_${i}`;

function rotuloWinners(r, R) {
    const restantes = R - r;
    if (restantes === 0) return 'Winners Final';
    if (restantes === 1) return 'Semifinal (Winners)';
    if (restantes === 2) return 'Quartas (Winners)';
    if (restantes === 3) return 'Oitavas (Winners)';
    return `Winners R${r}`;
}
function rotuloLosers(r, LR) {
    return r === LR ? '🔥 Losers Final' : `Losers R${r}`;
}

document.getElementById('btnIniciar').addEventListener('click', async () => {
    const n = competidores.length;
    if (n < 2) return alert("Adicione pelo menos 2 competidores!");
    if (n > 64) return alert("Esta estrutura suporta no máximo 64 competidores!");

    lutas = {};

    // Vagas: 16, 32 ou 64 (menor potência de 2 ≥ número de robôs, mín. 16)
    let VAGAS = 16;
    while (VAGAS < n) VAGAS *= 2;

    const R = Math.log2(VAGAS);      // rodadas da chave winners
    const LR = 2 * (R - 1);          // rodadas da chave losers

    const criar = (id, round, lado, rotulo, nextWin, nextLos) => {
        lutas[id] = { id, round, lado, rotulo, p1: null, p2: null, win: null, los: null, visivel: true, horario: "", nextWin, nextLos };
    };

    // --- Chave Winners (todas as rodadas) ---
    for (let r = 1; r <= R; r++) {
        const count = VAGAS / Math.pow(2, r);
        for (let i = 1; i <= count; i++) {
            const nextWin = r < R ? WID(r + 1, Math.ceil(i / 2)) : 'FINAL';
            const nextLos = r === 1 ? LID(1, Math.ceil(i / 2)) : LID(2 * (r - 1), i);
            criar(WID(r, i), r, 'winners', rotuloWinners(r, R), nextWin, nextLos);
        }
    }

    // --- Chave Losers (todas as rodadas) ---
    for (let r = 1; r <= LR; r++) {
        const count = VAGAS / Math.pow(2, Math.floor((r - 1) / 2) + 2);
        for (let i = 1; i <= count; i++) {
            let nextWin;
            if (r === LR) nextWin = 'FINAL';
            else if (r % 2 === 1) nextWin = LID(r + 1, i);              // mesma posição
            else nextWin = LID(r + 1, Math.ceil(i / 2));                // metade
            criar(LID(r, i), r, 'losers', rotuloLosers(r, LR), nextWin, null);
        }
    }

    // --- Grande Final ---
    criar('FINAL', R + 1, 'final', '👑 Grande Final', null, null);

    // --- Distribui os robôs na R1, com W.O. (BYE) espaçados pela chave ---
    const lutasR1 = VAGAS / 2;
    const byes = VAGAS - n;
    const woIdx = new Set();
    for (let k = 0; k < byes && k < lutasR1; k++) woIdx.add(Math.floor(k * lutasR1 / byes));

    const fila = competidores.map(c => c.nome);
    for (let i = 1; i <= lutasR1; i++) {
        const l = lutas[WID(1, i)];
        if (woIdx.has(i - 1)) {
            l.p1 = fila.shift() || 'BYE';
            l.p2 = 'BYE';
        } else {
            l.p1 = fila.shift() || 'BYE';
            l.p2 = fila.shift() || 'BYE';
        }
    }

    // Resolve walkovers (W.O.) em cascata: quem pegou BYE passa direto
    processarWalkovers();
    await salvarEstado();

    alert(`Torneio gerado com sucesso!\n\n${n} robôs em chave de ${VAGAS} vagas (${byes} W.O.).`);
    const btnAgenda = document.querySelectorAll('nav button')[1];
    window.mudarAba('agenda', { target: btnAgenda });
});

// ============================================================
// AGENDA
// ============================================================
function renderizarAgenda() {
    const containerWinners = document.getElementById('container-agenda-winners');
    const containerLosers = document.getElementById('container-agenda-losers');

    if (!containerWinners || !containerLosers) return;

    containerWinners.innerHTML = '';
    containerLosers.innerHTML = '';

    if (Object.keys(lutas).length === 0) {
        containerWinners.innerHTML = '<p>Nenhum torneio ativo.</p>';
        return;
    }

    let listaLutas = Object.values(lutas).filter(l => l.visivel && l.id && l.p1 !== 'BYE' && l.p2 !== 'BYE' && l.p1 && l.p2);

    let lutasWinners = listaLutas.filter(l => l.id && !l.id.startsWith('L'));
    let lutasLosers = listaLutas.filter(l => l.id && l.id.startsWith('L'));

    lutasWinners.forEach(l => containerWinners.innerHTML += criarCardAgendaHTML(l, false));
    lutasLosers.forEach(l => containerLosers.innerHTML += criarCardAgendaHTML(l, true));
}

function criarCardAgendaHTML(luta, isLoser) {
    const valorHorario = (luta.horario && luta.horario !== "undefined") ? luta.horario : "";

    return `
        <div class="luta-card ${isLoser ? 'losers-card' : ''} ${luta.win ? 'concluida' : ''}">
          <div><strong>Luta ${luta.id}</strong> - ${luta.win ? '✅ Concluída' : '⏳ Em Aberto'}</div>

          <div style="margin: 8px 0;">
            <label style="font-size: 0.85em; font-weight: bold;">Horário: </label>
            <input
              type="text"
              placeholder="13:30"
              maxlength="5"
              value="${valorHorario}"
              onblur="salvarHorario('${luta.id}', this.value)"
              style="padding: 4px 8px; border-radius: 4px; border: 1px solid #ccc; width: 80px; text-align: center;"
            >
          </div>

          <p><strong>${luta.p1 || 'Pendente'}</strong> vs <strong>${luta.p2 || 'Pendente'}</strong></p>

          <label>Marcar Vencedor:</label>
          <select onchange="salvarVencedor('${luta.id}', this.value)" ${(!luta.p1 || !luta.p2 || luta.p1 === 'Pendente' || luta.p2 === 'Pendente') ? 'disabled' : ''}>
            <option value="">Selecione...</option>
            ${luta.p1 && luta.p1 !== 'Pendente' ? `<option value="${luta.p1}" ${luta.win === luta.p1 ? 'selected' : ''}>${luta.p1}</option>` : ''}
            ${luta.p2 && luta.p2 !== 'Pendente' ? `<option value="${luta.p2}" ${luta.win === luta.p2 ? 'selected' : ''}>${luta.p2}</option>` : ''}
          </select>
        </div>
    `;
}

// ============================================================
// HORÁRIOS (intervalo mínimo de 40 min por robô)
// ============================================================
function paraMinutos(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) return null;
    const h = +m[1], min = +m[2];
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
}

function paraHHMM(min) {
    const h = Math.floor(min / 60) % 24;
    const m = min % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// Retorna mensagem de conflito ou null se estiver ok
function verificarConflito(idLuta, horario) {
    const alvo = paraMinutos(horario);
    if (alvo === null) return 'Formato inválido. Use HH:MM (ex: 13:30)';

    if (!lutas[idLuta]) return null;
    const jogadores = [lutas[idLuta].p1, lutas[idLuta].p2].filter(p => p && p !== 'BYE');

    for (const l of Object.values(lutas)) {
        if (!l || !l.id || l.id === idLuta || !l.horario) continue;
        const h = paraMinutos(l.horario);
        if (h === null) continue;
        for (const jog of jogadores) {
            if (l.p1 === jog || l.p2 === jog) {
                const diff = Math.abs(h - alvo);
                if (diff < INTERVALO_MIN) {
                    return `Conflito! ${jog} já luta em ${l.horario} (luta ${l.id}). Mínimo: ${INTERVALO_MIN} min entre lutas.`;
                }
            }
        }
    }
    return null;
}

window.salvarHorario = async function(id, horario) {
    if (!lutas[id]) return;
    horario = horario.trim();
    if (horario) {
        const conflito = verificarConflito(id, horario);
        if (conflito) {
            alert('⚠️ ' + conflito);
            renderizarAgenda();
            return;
        }
    }
    lutas[id].horario = horario;
    await salvarEstado();
};

// Gera horários automaticamente respeitando o intervalo por robô
window.gerarHorarios = async function() {
    const inicioStr = document.getElementById('horaInicio').value.trim() || '10:00';
    const inicio = paraMinutos(inicioStr);
    if (inicio === null) return alert('Hora inicial inválida. Use HH:MM');

    // Ordem cronológica: intercala rodadas winners e losers (só lutas reais)
    const lista = Object.values(lutas).filter(l => l.id && l.id !== 'CAMPEAO');
    lista.sort((a, b) =>
        ((a.id === 'FINAL') ? 1 : 0) - ((b.id === 'FINAL') ? 1 : 0) ||
        (a.round - b.round) ||
        ((a.lado === 'losers') ? 1 : 0) - ((b.lado === 'losers') ? 1 : 0) ||
        a.id.localeCompare(b.id));

    const ultimoHorario = {}; // jogador -> minutos da última luta
    let cursor = inicio;

    for (const l of lista) {
        if (!l || !l.visivel || !l.p1 || !l.p2 || l.p1 === 'BYE' || l.p2 === 'BYE') continue;

        let t = cursor;
        for (const jog of [l.p1, l.p2]) {
            if (ultimoHorario[jog] !== undefined && ultimoHorario[jog] + INTERVALO_MIN > t) {
                t = ultimoHorario[jog] + INTERVALO_MIN;
            }
        }
        l.horario = paraHHMM(t);
        ultimoHorario[l.p1] = t;
        ultimoHorario[l.p2] = t;
        cursor = t + DURACAO_LUTA;
    }

    await salvarEstado();
    renderizarAgenda();
};

// ============================================================
// VENCEDOR + PROGRESSÃO (dupla eliminação)
// ============================================================
window.salvarVencedor = async function(id, vencedor) {
    if (!vencedor) return;

    let luta = lutas[id];

    // Se já havia um vencedor diferente, desfaz o avanço anterior (em cascata)
    if (luta.win === vencedor) return;
    if (luta.win) desfazerAvanco(id);

    luta.win = vencedor;
    luta.los = (vencedor === luta.p1) ? luta.p2 : luta.p1;

    avancarVencedorNaEstrutura(id, vencedor, luta.los);
    processarWalkovers(); // resolve eventuais novos walkovers gerados

    await salvarEstado();
    renderizarAgenda();
}

// Desfaz o avanço de uma luta já decidida, removendo vencedor/perdedor
// das lutas seguintes (recursivamente, se elas também já tiverem resultado)
function desfazerAvanco(id) {
    const luta = lutas[id];
    if (!luta || !luta.win) return;

    removerJogadorDeLuta(luta.nextWin, luta.win);
    removerJogadorDeLuta(luta.nextLos, luta.los);

    if (id === 'FINAL') delete lutas['CAMPEAO'];

    luta.win = null;
    luta.los = null;
}

function removerJogadorDeLuta(idLuta, jogador) {
    if (!idLuta || !jogador) return;
    const l = lutas[idLuta];
    if (!l) return;

    // Se a luta de destino já tinha resultado, desfaz o avanço dela também
    if (l.win) desfazerAvanco(idLuta);

    if (l.p1 === jogador) l.p1 = null;
    if (l.p2 === jogador) l.p2 = null;
}

// Progressão genérica: usa apenas nextWin/nextLos gravados na criação da luta
function avancarVencedorNaEstrutura(id, vencedor, perdedor) {
    const luta = lutas[id];
    if (!luta || !luta.id) return;

    if (luta.nextWin) garantirEAtribuir(luta.nextWin, vencedor);
    if (luta.nextLos) garantirEAtribuir(luta.nextLos, perdedor);
    if (id === 'FINAL') lutas['CAMPEAO'] = { win: vencedor };
}

function garantirLuta(id, nextWin = null, nextLos = null) {
    if (!lutas[id]) {
        lutas[id] = { id: id, p1: null, p2: null, win: null, los: null, visivel: true, horario: "", nextWin, nextLos };
    } else {
        if (nextWin) lutas[id].nextWin = nextWin;
        if (nextLos) lutas[id].nextLos = nextLos;
    }
}

function garantirEAtribuir(idLuta, jogador, nextWin = null, nextLos = null) {
    if (!jogador) return;
    garantirLuta(idLuta, nextWin, nextLos);
    let l = lutas[idLuta];
    // BYE propagado: ocupa o primeiro slot vazio (nunca colapsa nem sobrescreve)
    if (jogador === 'BYE') {
        if (!l.p1) l.p1 = 'BYE';
        else if (!l.p2) l.p2 = 'BYE';
        return;
    }
    if (!l.p1 || l.p1 === jogador) l.p1 = jogador;
    else if (!l.p2 || l.p2 === jogador) l.p2 = jogador;
}

// Decide automaticamente lutas onde um dos lados é BYE (walkover),
// repetindo até não haver mais mudanças (propaga em cascata)
function processarWalkovers() {
    let mudou = true;
    while (mudou) {
        mudou = false;
        for (const l of Object.values(lutas)) {
            if (!l || !l.id || l.id === 'CAMPEAO' || l.win) continue;
            const b1 = l.p1 === 'BYE';
            const b2 = l.p2 === 'BYE';
            if (b1 && b2) {
                // BYE x BYE: propaga BYE como vencedor E perdedor
                l.win = 'BYE';
                l.los = 'BYE';
                l.visivel = true;
                avancarVencedorNaEstrutura(l.id, 'BYE', 'BYE');
                mudou = true;
            } else if (b1 !== b2) {
                const vencedor = b1 ? l.p2 : l.p1;
                if (!vencedor) continue; // lado real ainda não definido
                l.win = vencedor;
                l.los = 'BYE';
                // Mantém visível para que a luta apareça na agenda e chaveamento
                l.visivel = true;
                avancarVencedorNaEstrutura(l.id, vencedor, 'BYE');
                mudou = true;
            }
        }
    }
}

// ============================================================
// CHAVEAMENTO (render)
// ============================================================
function renderizarChaveamento() {
    const centerCol = document.getElementById('center-column');
    const winnersTree = document.getElementById('winners-tree');
    const losersTree = document.getElementById('losers-tree');

    if (!centerCol || !winnersTree || !losersTree) return;

    centerCol.innerHTML = '';
    winnersTree.innerHTML = '';
    losersTree.innerHTML = '';

    if (Object.keys(lutas).length === 0) {
        centerCol.innerHTML = '<p>Inicie o torneio para ver a chave.</p>';
        return;
    }

    // Agrupa lutas por rodada/lado (genérico para 16/32/64 vagas)
    const rodadasW = {};
    const rodadasL = {};
    for (const l of Object.values(lutas)) {
        if (!l.id || l.id === 'CAMPEAO' || l.id === 'FINAL') continue;
        if (!l.visivel) continue;
        const mapa = l.lado === 'losers' ? rodadasL : rodadasW;
        (mapa[l.round] = mapa[l.round] || []).push(l);
    }

    // CENTRO: Winners Rodada 1
    centerCol.innerHTML = '<div class="col-header">Centro (Rodada 1)</div>';
    (rodadasW[1] || []).forEach(l => centerCol.innerHTML += criarBoxHTML(l));

    // LOSERS TREE (lado esquerdo)
    Object.keys(rodadasL).sort((a, b) => a - b).forEach(r => {
        const grupo = rodadasL[r];
        const col = document.createElement('div');
        col.className = 'bracket-column';
        const isFinal = grupo[0].rotulo && grupo[0].rotulo.includes('Final');
        col.innerHTML = `<div class="col-header ${isFinal ? 'final-header' : 'losers-header'}">${grupo[0].rotulo}</div>`;
        grupo.forEach(l => col.innerHTML += criarBoxHTML(l, isFinal));
        losersTree.appendChild(col);
    });

    // WINNERS TREE (lado direito): rodadas 2 em diante
    Object.keys(rodadasW).sort((a, b) => a - b).forEach(r => {
        if (Number(r) === 1) return; // rodada 1 fica no centro
        const grupo = rodadasW[r];
        const col = document.createElement('div');
        col.className = 'bracket-column';
        const isFinal = grupo[0].rotulo && grupo[0].rotulo.includes('Final');
        col.innerHTML = `<div class="col-header ${isFinal ? 'final-header' : ''}">${grupo[0].rotulo}</div>`;
        grupo.forEach(l => col.innerHTML += criarBoxHTML(l));
        winnersTree.appendChild(col);
    });

    // GRANDE FINAL & CAMPEÃO
    let lutaFinal = lutas['FINAL'];
    if (lutaFinal) {
        let colFinal = document.createElement('div');
        colFinal.className = 'bracket-column';
        colFinal.innerHTML = `<div class="col-header final-header">👑 Grande Final</div>` + criarBoxHTML(lutaFinal, true);

        if (lutas['CAMPEAO']) {
            colFinal.innerHTML += `
                <div class="champion-box" id="node-CAMPEAO">
                  <div class="title">🏆 GRAND CHAMPION 🏆</div>
                  <div class="winner-name">${lutas['CAMPEAO'].win}</div>
                </div>
            `;
        }
        winnersTree.appendChild(colFinal);
    }

    setTimeout(desenharLinhas, 50);
}

function criarBoxHTML(luta, isDestaque = false) {
    const horaTexto = (luta.horario && luta.horario !== "undefined") ? luta.horario : "";
    return `
        <div class="match-box ${isDestaque ? 'final-box' : ''}" id="node-${luta.id}">
          <span class="tag">${isDestaque ? '🔥 ' : ''}Luta ${luta.id} ${horaTexto ? `(${horaTexto})` : ''}</span>
          <div class="player ${luta.win === luta.p1 ? 'winner' : (luta.los === luta.p1 ? 'loser' : '')}">
            ${luta.p1 || '— A definir —'}
          </div>
          <div class="player ${luta.win === luta.p2 ? 'winner' : (luta.los === luta.p2 ? 'loser' : '')}">
            ${luta.p2 || '— A definir —'}
          </div>
        </div>
    `;
}

function desenharLinhas() {
    const svg = document.getElementById('svg-lines');
    const wrapper = document.getElementById('bracket-wrapper');
    if (!svg || !wrapper) return;

    svg.innerHTML = '';
    const wrapperRect = wrapper.getBoundingClientRect();

    Object.values(lutas).forEach(luta => {
        if (!luta.visivel) return;
        if (luta.nextWin) conectarNos(luta.id, luta.nextWin, svg, wrapperRect);
        if (luta.nextLos) conectarNos(luta.id, luta.nextLos, svg, wrapperRect);
    });
}

function conectarNos(idOrigem, idDestino, svg, wrapperRect) {
    const elDe = document.getElementById(`node-${idOrigem}`);
    const elPara = document.getElementById(`node-${idDestino}`);

    if (elDe && elPara) {
        const rectDe = elDe.getBoundingClientRect();
        const rectPara = elPara.getBoundingClientRect();

        const y1 = (rectDe.top + rectDe.bottom) / 2 - wrapperRect.top;
        const y2 = (rectPara.top + rectPara.bottom) / 2 - wrapperRect.top;

        let x1, x2;
        if (rectPara.left >= rectDe.right) {
            // destino à direita: sai pela borda direita, chega pela esquerda
            x1 = rectDe.right - wrapperRect.left;
            x2 = rectPara.left - wrapperRect.left;
        } else if (rectPara.right <= rectDe.left) {
            // destino à esquerda: sai pela borda esquerda, chega pela direita
            x1 = rectDe.left - wrapperRect.left;
            x2 = rectPara.right - wrapperRect.left;
        } else {
            // mesma faixa horizontal: centro a centro
            x1 = (rectDe.left + rectDe.right) / 2 - wrapperRect.left;
            x2 = (rectPara.left + rectPara.right) / 2 - wrapperRect.left;
        }

        const mx = (x1 + x2) / 2;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`);
        svg.appendChild(path);
    }
}

window.addEventListener('resize', () => {
    if (document.getElementById('tab-chaveamento') && document.getElementById('tab-chaveamento').classList.contains('active')) {
        desenharLinhas();
    }
});

// Título da página mostra a categoria
document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('header h1').textContent = `⚙️ Admin — ${CATEGORIA}`;
});

// Inicialização
sincronizarBanco();
