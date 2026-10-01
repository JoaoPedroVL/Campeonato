// ============================================================
// TELA PÚBLICA — Torneio de Robôs (banco local via servidor)
// ============================================================

const CATEGORIA = new URLSearchParams(location.search).get('cat') || 'geral';

let lutas = {};
let ultimaAtualizacao = null;

// Polling de tempo real (3s)
function sincronizarBancoPublico() {
    carregarEExibir();
    setInterval(carregarEExibir, 3000);
}

async function carregarEExibir() {
    try {
        const res = await fetch('/api/torneio/' + encodeURIComponent(CATEGORIA), { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const dados = await res.json();
        if (dados.atualizadoEm === ultimaAtualizacao) return;
        ultimaAtualizacao = dados.atualizadoEm;
        lutas = dados.lutas || {};
        renderizarAgendaPublica();
        renderizarChaveamentoPublico();
        setTimeout(desenharLinhas, 100);
    } catch (erro) {
        console.error('Erro ao carregar dados:', erro);
        const c = document.getElementById('public-agenda-winners');
        if (c && !ultimaAtualizacao) c.innerHTML = `<p style="color:#f44336;">⚠️ Erro de conexão com o servidor local.</p>`;
    }
}

function renderizarAgendaPublica() {
    const containerWinners = document.getElementById('public-agenda-winners');
    const containerLosers = document.getElementById('public-agenda-losers');

    if (!containerWinners || !containerLosers) return;

    containerWinners.innerHTML = '';
    containerLosers.innerHTML = '';

    if (Object.keys(lutas).length === 0) {
        containerWinners.innerHTML = '<p style="color:#aaa;">Nenhum torneio iniciado.</p>';
        return;
    }

    let listaLutas = Object.values(lutas).filter(l => l.visivel && l.id && l.p1 !== 'BYE' && l.p2 !== 'BYE' && l.p1 && l.p2);

    let lutasWinners = listaLutas.filter(l => l.id && !l.id.startsWith('L'));
    let lutasLosers = listaLutas.filter(l => l.id && l.id.startsWith('L'));

    lutasWinners.forEach(l => containerWinners.innerHTML += criarCardAgendaPublicoHTML(l, false));
    lutasLosers.forEach(l => containerLosers.innerHTML += criarCardAgendaPublicoHTML(l, true));
}

function criarCardAgendaPublicoHTML(luta, isLoser) {
    const horarioTexto = (luta.horario && luta.horario !== "undefined" && luta.horario !== "") ? `🕒 ${luta.horario}` : "🕒 Horário a definir";
    const statusTexto = luta.win ? '✅ Concluída' : '⏳ Em Andamento / Aguardando';

    return `
        <div class="luta-card ${isLoser ? 'losers-card' : ''} ${luta.win ? 'concluida' : ''}" style="background: #252525; border-color: #444; color: #fff;">
          <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 6px;">
            <strong>Luta ${luta.id}</strong>
            <span style="color: #00bcd4; font-size: 0.85rem;">${horarioTexto}</span>
          </div>

          <div style="font-size: 0.8rem; margin-bottom: 8px; color: ${luta.win ? '#4caf50' : '#ff9800'};">
            ${statusTexto}
          </div>

          <div style="font-size: 1.05rem; padding: 6px 0; border-top: 1px solid #333; border-bottom: 1px solid #333;">
            <div style="color: ${luta.win === luta.p1 ? '#4caf50' : 'inherit'}; font-weight: ${luta.win === luta.p1 ? 'bold' : 'normal'};">
              🤖 ${luta.p1 || 'Pendente'} ${luta.win === luta.p1 ? '👑' : ''}
            </div>
            <div style="margin: 4px 0; font-size: 0.8rem; color: #888; text-align: center;">VS</div>
            <div style="color: ${luta.win === luta.p2 ? '#4caf50' : 'inherit'}; font-weight: ${luta.win === luta.p2 ? 'bold' : 'normal'};">
              🤖 ${luta.p2 || 'Pendente'} ${luta.win === luta.p2 ? '👑' : ''}
            </div>
          </div>
        </div>
    `;
}

function renderizarChaveamentoPublico() {
    const centerCol = document.getElementById('center-column');
    const winnersTree = document.getElementById('winners-tree');
    const losersTree = document.getElementById('losers-tree');

    if (!centerCol || !winnersTree || !losersTree) return;

    centerCol.innerHTML = '';
    winnersTree.innerHTML = '';
    losersTree.innerHTML = '';

    if (Object.keys(lutas).length === 0) {
        centerCol.innerHTML = '<p style="color:#aaa; text-align:center;">Aguardando início do torneio...</p>';
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
    (rodadasW[1] || []).forEach(l => centerCol.innerHTML += criarBoxPublicoHTML(l));

    // LOSERS TREE
    Object.keys(rodadasL).sort((a, b) => a - b).forEach(r => {
        const grupo = rodadasL[r];
        const col = document.createElement('div');
        col.className = 'bracket-column';
        const isFinal = grupo[0].rotulo && grupo[0].rotulo.includes('Final');
        col.innerHTML = `<div class="col-header ${isFinal ? 'final-header' : 'losers-header'}">${grupo[0].rotulo}</div>`;
        grupo.forEach(l => col.innerHTML += criarBoxPublicoHTML(l, isFinal));
        losersTree.appendChild(col);
    });

    // WINNERS TREE: rodadas 2 em diante
    Object.keys(rodadasW).sort((a, b) => a - b).forEach(r => {
        if (Number(r) === 1) return;
        const grupo = rodadasW[r];
        const col = document.createElement('div');
        col.className = 'bracket-column';
        const isFinal = grupo[0].rotulo && grupo[0].rotulo.includes('Final');
        col.innerHTML = `<div class="col-header ${isFinal ? 'final-header' : ''}">${grupo[0].rotulo}</div>`;
        grupo.forEach(l => col.innerHTML += criarBoxPublicoHTML(l));
        winnersTree.appendChild(col);
    });

    // GRANDE FINAL & CAMPEÃO
    let lutaFinal = lutas['FINAL'];
    if (lutaFinal) {
        let colFinal = document.createElement('div');
        colFinal.className = 'bracket-column';
        colFinal.innerHTML = `<div class="col-header final-header">👑 Grande Final</div>` + criarBoxPublicoHTML(lutaFinal, true);

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

function criarBoxPublicoHTML(luta, isDestaque = false) {
    const horaTexto = (luta.horario && luta.horario !== "undefined" && luta.horario !== "") ? `(${luta.horario})` : "";
    return `
        <div class="match-box ${isDestaque ? 'final-box' : ''}" id="node-${luta.id}">
          <span class="tag">${isDestaque ? '🔥 ' : ''}Luta ${luta.id} ${horaTexto}</span>
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
            x1 = rectDe.right - wrapperRect.left;
            x2 = rectPara.left - wrapperRect.left;
        } else if (rectPara.right <= rectDe.left) {
            x1 = rectDe.left - wrapperRect.left;
            x2 = rectPara.right - wrapperRect.left;
        } else {
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
    desenharLinhas();
});

// Título mostra a categoria
document.addEventListener('DOMContentLoaded', () => {
    const h1 = document.querySelector('header h1');
    if (h1) h1.innerHTML = `🤖 ${CATEGORIA} — Chaveamento ao Vivo`;
});

// Inicialização da página pública
sincronizarBancoPublico();
