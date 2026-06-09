const API_KEY = 'REDE_EXECUTORA_2026';
const app = document.getElementById('app');
const $ = (s, r=document) => r.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
const fmt = n => Number(n||0).toLocaleString('pt-BR');
const tetoLabel = r => (r?.tetoMensal === null || r?.tetoMensal === undefined || r?.tetoMensal === '') ? 'Teto não definido' : fmt(r.tetoMensal);
const valorContratoLabel = r => { const v = r?.valorGlobalContrato ?? r?.valor_global_contrato ?? ''; if(v === null || v === undefined || v === '') return 'Não informado'; const n = Number(String(v).replace(/[^0-9,.-]/g,'').replace('\.','').replace(',','.')); return Number.isFinite(n) && n>0 ? n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : String(v); };
const monthNow = () => new Date().toISOString().slice(0,7);
function competenciaLabel(v){ const [y,m]=String(v||monthNow()).split('-'); const nomes=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']; return `${nomes[Number(m)-1]||m} de ${y}`; }
let DATA = null, panel = null, selection = null, providerDrawer = null, panelHistory = [], currentQuery = '';

const menu = [
  {id:'servicos', label:'Serviços', hint:'Prestador, tipo de serviço, valor global e teto físico mensal'},
  {id:'municipios', label:'Municípios', hint:'Consultar tetos por município'},
  {id:'panorama', label:'Panorama da Rede', hint:'Macro 1 e Macro 2'},
  {id:'relatorios', label:'Relatórios', hint:'Imprimir e exportar consulta'},
];

async function apiPublic(mes){
  const r = await fetch(`/api/public/rede-executora?mes=${encodeURIComponent(mes)}&key=${encodeURIComponent(API_KEY)}`);
  const j = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.erro || 'Erro ao carregar dados da rede.');
  return j;
}
async function apiPost(url, body){
  const r = await fetch(`${url}?key=${encodeURIComponent(API_KEY)}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body||{})});
  const j = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.erro || 'Erro ao salvar.');
  return j;
}
function getMes(){ return DATA?.competencia || monthNow(); }
function flat(){ return Object.entries(DATA?.municipios||{}).sort((a,b)=>String(a[0]).localeCompare(String(b[0]),'pt-BR')).flatMap(([municipio, itens]) => (itens||[]).map(row => ({...row, municipio})).sort((a,b)=>String(a.prestador||'').localeCompare(String(b.prestador||''),'pt-BR') || String(a.servico||'').localeCompare(String(b.servico||''),'pt-BR'))); }
function procFlat(){ return flat().flatMap(row => (row.procedimentos||[]).map(p => ({...p, municipio:row.municipio, prestador:row.prestador, servico:row.servico, natureza:row.natureza, contrato_fim:row.contrato_fim, numero_contrato:row.numero_contrato, bloqueado:row.bloqueado, motivo_bloqueio:row.motivo_bloqueio, observacao:row.observacao}))); }
function uniq(arr){ return [...new Set(arr.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')); }
function rowsByServico(s){ return flat().filter(r => norm(r.servico) === norm(s)); }
function rowsByMunicipio(m){ return flat().filter(r => norm(r.municipio) === norm(m)); }
function rowsByPrestador(p){ return flat().filter(r => norm(r.prestador) === norm(p)); }
function rowsByProcedimento(name){ return flat().filter(r => (r.procedimentos||[]).some(p => norm(`${p.codigo} ${p.nome}`).includes(norm(name)))); }
function servicos(){ return uniq(flat().map(r=>r.servico)); }
function municipios(){ return uniq(Object.keys(DATA?.municipios||{})); }
function prestadores(){ return uniq(flat().map(r=>r.prestador)); }
function allProcedimentos(){ const map = new Map(); procFlat().forEach(p => map.set(`${p.codigo||''}|${p.nome}`, p)); return [...map.values()].sort((a,b)=>String(a.nome).localeCompare(String(b.nome),'pt-BR')); }
function blockedServices(){ return flat().filter(r => r.bloqueado || r.motivo_bloqueio); }
function parseDate(v){ if(!v) return null; if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v+'T12:00:00'); const m=String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if(m) return new Date(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}T12:00:00`); return null; }
function brDate(v){ if(!v) return ''; if(/^\d{4}-\d{2}-\d{2}$/.test(v)){ const [y,m,d]=v.split('-'); return `${d}/${m}/${y}`; } return String(v); }
function daysUntil(v){ const d = parseDate(v); if(!d) return null; const now = new Date(); now.setHours(12,0,0,0); return Math.ceil((d-now)/86400000); }
function statusContrato(row){ const d = daysUntil(row.contrato_fim); if(d === null) return {tone:'neutral', text:'Sem vigência'}; if(d < 0) return {tone:'bad', text:`Vencido há ${Math.abs(d)} dia(s)`}; if(d <= 30) return {tone:'critical', text:`Faltam ${d} dia(s)`}; if(d <= 60) return {tone:'warn', text:`Faltam ${d} dia(s)`}; return {tone:'ok', text:`Faltam ${d} dia(s)`}; }
function naturezaLabel(n){ const x=norm(n); if(x.includes('PROPRIA')) return 'Rede própria'; if(x.includes('PACT')) return 'Pactuação'; if(x.includes('CONVEN')) return 'Convênio'; if(x.includes('GEST')) return 'Contrato de gestão'; if(x.includes('CRED')) return 'Credenciada'; return n ? cap(n) : 'Contratualizada'; }
function naturezaTone(n){ const x=norm(n); if(x.includes('PROPRIA')) return 'ok'; if(x.includes('GEST')) return 'critical'; if(x.includes('PACT')) return 'warn'; return 'neutral'; }
function cap(s){ return String(s||'').toLowerCase().replace(/(^|\s)\S/g, l=>l.toUpperCase()).replace('De ','de ').replace('Da ','da ').replace('Do ','do '); }
function providerDetail(nome){ const rede = rowsByPrestador(nome); const procObjs=[]; rede.forEach(r=>(r.procedimentos||[]).forEach(p=>procObjs.push({...p, prestadorId:r.prestadorId, instrumentoId:r.instrumentoId, servico:r.servico, bloqueado:r.bloqueado}))); const procs = uniq(procObjs.map(p => `${p.codigo ? p.codigo+' - ' : ''}${p.nome}${p.oferta && p.oferta !== '-' ? ' • Oferta: '+p.oferta : ''}`)); const first = rede[0] || {}; return {nome, prestadorId:first.prestadorId, rede, municipio: uniq(rede.map(r=>r.municipio)).join(' • '), servicos: uniq(rede.map(r=>r.servico)), natureza:first.natureza, numero_contrato: uniq(rede.map(r=>r.numero_contrato)).join(' • '), contrato_fim: uniq(rede.map(r=>brDate(r.contrato_fim))).join(' • '), procedimentos: procs, procedimentoObjetos: procObjs, bloqueado: rede.some(r=>r.bloqueado||r.motivo_bloqueio), bloqueios: rede.filter(r=>r.bloqueado||r.motivo_bloqueio).map(r=>({servico:r.servico, municipio:r.municipio, motivo:r.motivo_bloqueio||'Prestador bloqueado'})), observacoes: uniq(rede.map(r=>r.observacao)), valoresContrato: uniq(rede.map(r=>valorContratoLabel(r))).join(' • ')}; }
function stats(){ const rows=flat(), procs=procFlat(); return {municipios:municipios().length, prestadores:prestadores().length, servicos:rows.length, procedimentos:procs.length, bloqueados:blockedServices().length, oferta:procs.reduce((s,p)=>s+(p.oferta==='-'?0:Number(p.oferta||0)),0)}; }
function group(arr, key){ const o={}; arr.forEach(x=>{ const k=x[key]||'-'; o[k]=(o[k]||0)+1; }); return o; }

const MACRORREGIOES = {
  'Macro 1': ['ALTO PARAÍSO','ARIQUEMES','BURITIS','CACAULÂNDIA','CAMPO NOVO DE RONDÔNIA','CANDEIAS DO JAMARI','CUJUBIM','GOVERNADOR JORGE TEIXEIRA','GUAJARÁ-MIRIM','ITAPUÃ DO OESTE','JARU','MACHADINHO DO OESTE','MONTE NEGRO','NOVA MAMORÉ','PORTO VELHO','RIO CRESPO','THEOBROMA','VALE DO ANARI'],
  'Macro 2': ['ALTA FLORESTA DO OESTE','ALTO ALEGRE DOS PARECIS','ALVORADA DO OESTE','CABIXI','CACOAL','CASTANHEIRAS','CEREJEIRAS','CHUPINGUAIA','COLORADO DO OESTE','CORUMBIARA','COSTA MARQUES','ESPIGÃO DO OESTE','JI-PARANÁ','MINISTRO ANDREAZZA','MIRANTE DA SERRA','NOVA BRASILÂNDIA DO OESTE','NOVA UNIÃO','NOVO HORIZONTE DO OESTE','OURO PRETO DO OESTE','PARECIS','PIMENTA BUENO','PIMENTEIRAS DO OESTE','PRESIDENTE MÉDICI','PRIMAVERA DE RONDÔNIA','ROLIM DE MOURA','SANTA LUZIA DO OESTE','SÃO FELIPE DO OESTE','SÃO FRANCISCO DO GUAPORÉ','SÃO MIGUEL DO GUAPORÉ','SERINGUEIRAS','TEIXEIRÓPOLIS','URUPÁ','VALE DO PARAÍSO','VILHENA']
};
function macroMunicipios(nome){ return (MACRORREGIOES[nome]||[]).filter(m => municipios().some(x=>norm(x)===norm(m))); }
function rowsByMacro(nome){ const ms=macroMunicipios(nome); return flat().filter(r => ms.some(m=>norm(m)===norm(r.municipio))); }
function macroResumo(nome){ const rows=rowsByMacro(nome); return {macro:nome, municipios:macroMunicipios(nome), rows, prestadores:uniq(rows.map(r=>r.prestador)).length, servicos:uniq(rows.map(r=>r.servico)).length, bloqueados:rows.filter(r=>r.bloqueado||r.motivo_bloqueio).length, oferta:rows.flatMap(r=>r.procedimentos||[]).reduce((s,p)=>s+(p.oferta==='-'?0:Number(p.oferta||0)),0)}; }

function enc(v){ return encodeURIComponent(String(v ?? '')); }
function dec(v){ try { return decodeURIComponent(String(v ?? '')); } catch(e){ return String(v ?? ''); } }

function drawerHtml(kind){
  const titles = {
    servicos:'Serviços',
    municipios:'Municípios',
    panorama:'Panorama da Rede',
    relatorios:'Relatórios',
    procedimentos:'Procedimentos',
    vigencias:'Vigências',
    bloqueios:'Bloqueios'
  };
  const subtitles = {
    servicos:'Consulta por tipo de serviço',
    municipios:'Consulta por localidade',
    panorama:'Macro 1 e Macro 2',
    relatorios:'Relatórios de consulta',
    procedimentos:'Busca de procedimentos',
    vigencias:'Contratos e vigências',
    bloqueios:'Prestadores bloqueados'
  };
  let body = '';
  if(kind === 'servicos'){
    const items = servicos().filter(match);
    body = drawerList('Buscar serviço', items, s => ({title:s, subtitle:'Prestador, tipo de serviço, valor global e teto físico mensal consolidado.', rows:rowsByServico(s), sourcePanel:'servicos'}));
  } else if(kind === 'municipios'){
    const items = municipios().filter(match);
    body = drawerList('Buscar município', items, m => ({title:m, subtitle:'Prestadores, tipos de serviço, valores globais e tetos físicos mensais consolidados.', rows:rowsByMunicipio(m), sourcePanel:'municipios'}));
  } else if(kind === 'panorama'){
    body = panoramaDrawer();
  } else if(kind === 'relatorios'){
    body = relatoriosDrawer();
  } else if(kind === 'procedimentos'){
    body = procedimentosDrawer();
  } else if(kind === 'vigencias'){
    body = vigenciasDrawer();
  } else if(kind === 'bloqueios'){
    body = bloqueiosDrawer();
  } else {
    body = '<div class="drawerBody"><div class="drawerNote">Consulta não encontrada.</div></div>';
  }
  return `<div class="drawerBackdrop drawerOpen" onclick="closePanel(event)">
    <aside class="drawer" onclick="event.stopPropagation()">
      <div class="drawerHeader"><div><div class="drawerNavRow">${panelHistory.length?'<button class="backButton" onclick="backPanel()">← Voltar</button>':''}</div><span class="eyebrow">${esc(subtitles[kind]||'Consulta')}</span><h2>${esc(titles[kind]||'Consulta')}</h2></div><button class="iconButton" onclick="closePanel()">×</button></div>
      ${body}
    </aside>
  </div>`;
}

function rowResumoTexto(r){
  return `${r.prestador} • ${r.servico || '-'} • Valor global: ${valorContratoLabel(r)} • Teto físico mensal: ${tetoLabel(r)}`;
}




function bindEvents(){
  if(window.__redeExecutoraBindEvents) return;
  window.__redeExecutoraBindEvents = true;
  window.addEventListener('message', (event) => {
    const data = event.data || {};
    if(data.type === 'RO_MUNICIPIO_CLICK' && data.municipio){
      const rows = rowsByMunicipio(data.municipio).sort((a,b)=>String(a.prestador||'').localeCompare(String(b.prestador||''),'pt-BR') || String(a.servico||'').localeCompare(String(b.servico||''),'pt-BR'));
      selectRows({
        title: data.municipio,
        subtitle: 'Prestadores, tipos de serviço, valores globais e tetos físicos mensais consolidados.',
        rows,
        sourcePanel: 'municipios'
      });
    }
  });
}

function render(){
  app.innerHTML = `<div class="proShell">
    <aside class="proSidebar">
      <div class="proBrand"><div class="brandMark">CREG</div><div><strong>Painel Rede Executora</strong><span>Coordenadoria de Regulação de Acesso</span><span>CREG/RO</span><span class="developerLine">Desenvolvido por: Renato Castro</span></div></div>
      <div class="topControls"><label class="eyebrow">Competência</label><div class="competenciaAuto">${competenciaLabel(DATA?.competencia||monthNow())}</div></div>
      <nav class="proNav">${menu.map(item=>`<button onclick="openPanel('${item.id}')"><strong>${item.label}</strong><span>${item.hint}</span></button>`).join('')}</nav>
    </aside>
    <main class="proMain proMainClean">${workspaceHtml()}</main>
    ${panel ? drawerHtml(panel) : ''}${providerDrawer ? providerDrawerHtml(providerDrawer) : ''}
  </div>`;
  bindEvents();
  sendMapMunicipios();
}
function workspaceHtml(){
  return `<section class="workAreaOnly"><div class="selectionPanel mainSelectionPanel">${!selection ? landingHtml() : selectionHtml()}</div></section>`;
}
function landingHtml(){
  const s=stats();
  return `<div class="homeDashboard"><section class="mainMapCard"><div class="mainMapHeader"><div><span class="eyebrow">Mapa de Rondônia</span><h2>Rede Executora por município</h2><p>Clique nos municípios em destaque para consultar a oferta disponível.</p></div><span class="miniBadge">Competência: ${esc(competenciaLabel(DATA?.competencia||monthNow()))}</span></div><iframe id="sidebar-map-frame" class="mainMapFrame" src="/mapa-ro.html" title="Mapa interativo de Rondônia"></iframe><div class="mapLoading mapLoadingCenter">Municípios com dados do SIGOA: ${municipios().length}</div></section><section class="homeStats"><div class="fieldPill"><span>Prestadores</span><strong>${fmt(s.prestadores)}</strong></div><div class="fieldPill"><span>Tipos de serviço</span><strong>${fmt(s.servicos)}</strong></div><div class="fieldPill"><span>Municípios</span><strong>${fmt(s.municipios)}</strong></div><div class="fieldPill"><span>Com teto definido</span><strong>${fmt(flat().filter(r=>r.tetoMensal!==null&&r.tetoMensal!==undefined).length)}</strong></div></section><p class="muted homeHint">Selecione uma consulta no menu lateral ou clique em um município no mapa.</p><p class="developerFooter">Desenvolvido por: Renato Castro • Versão consulta integrada ao SIGOA</p></div>`;
}
function selectionHtml(){
  return `<div class="canvasHeader selectionHeaderWithActions"><div><span class="eyebrow">Consulta selecionada</span><h2>${esc(selection.title)}</h2><p>${esc(selection.subtitle)}</p></div><div class="selectionActions">${selection.sourcePanel ? `<button class="backButton" onclick="backToPanel()">← Voltar</button>`:''}<span class="miniBadge">${selection.rows.length} registro(s)</span>${selection.rows.length ? `<button class="backButton" onclick="downloadSelectionCSV()">⬇️ CSV</button><button class="backButton" onclick="printSelection()">🖨️ Relatório</button>`:''}<button class="iconButton" onclick="closeSelection()">×</button></div></div><div class="resultList compactResultList mainResultList">${selection.rows.length ? selection.rows.map(rowMiniHtml).join('') : '<p class="muted">Nenhum registro encontrado.</p>'}</div>`;
}
function rowMiniHtml(row){ return `<div class="resultItem plainRecord ${row.bloqueado?'resultItemBlocked':''}"><div class="resultInfo"><div class="providerTitleBlock"><button class="providerNameButton" onclick="openProvider('${enc(row.prestador)}')">${esc(row.prestador)}</button><div class="providerMunicipioLine"><span>Tipo de serviço:</span> <strong class="municipioStrong">${esc(row.servico||'-')}</strong></div></div><p><b>Valor Global do Contrato:</b> ${esc(valorContratoLabel(row))}<br><b>Teto Físico Mensal:</b> ${esc(tetoLabel(row))}</p></div><div class="resultMeta resultMetaPlain"><span class="miniBadge">${esc(row.municipio||'')}</span><span class="miniBadge">Valor: ${esc(valorContratoLabel(row))}</span><span class="miniBadge">Teto: ${esc(tetoLabel(row))}</span></div></div>`; }
function match(s){ return !currentQuery || norm(s).includes(norm(currentQuery)); }
function searchInput(ph){ return `<input class="cleanInput" id="drawerSearch" value="${esc(currentQuery)}" placeholder="${ph}" oninput="currentQuery=this.value; render()">`; }
function drawerList(ph, items, makeSelection){ return `${searchInput(ph)}<div class="drawerBody">${items.length?items.map(item=>{ const sel=makeSelection(item); return `<button class="drawerOption" onclick='selectRows(${JSON.stringify(sel)})'><strong>${esc(item)}</strong><span>${sel.rows.length} registro(s)</span></button>`; }).join(''):'<div class="drawerNote">Nenhum item encontrado.</div>'}</div>`; }
function procedimentosDrawer(){ const procs=allProcedimentos().filter(p=>match(`${p.codigo} ${p.nome}`)).slice(0,80); const provs=prestadores().filter(match).slice(0,80); return `${searchInput('Buscar procedimento, código ou prestador')}<div class="drawerBody"><h3 class="drawerSectionTitle">Procedimentos</h3>${procs.map(p=>{ const rows=rowsByProcedimento(`${p.codigo} ${p.nome}`); return `<button class="drawerOption procedureOption" onclick='selectRows(${JSON.stringify({title:p.nome, subtitle:`Código ${p.codigo||'-'} • prestadores vinculados`, rows, sourcePanel:'procedimentos'})})'><strong>${esc(p.nome)}</strong><span>${esc(p.codigo||'-')} • ${rows.length} prestador(es)</span></button>`; }).join('')||'<div class="drawerNote">Nenhum procedimento cadastrado na competência/base atual.</div>'}<h3 class="drawerSectionTitle">Prestadores</h3>${provs.map(p=>`<button class="drawerOption" onclick="openProvider('${enc(p)}')"><strong>${esc(p)}</strong><span>Abrir rol de procedimentos do prestador</span></button>`).join('')}</div>`; }
function vigenciasDrawer(){ const rows=flat().filter(r=>r.contrato_fim).sort((a,b)=>(daysUntil(a.contrato_fim)??99999)-(daysUntil(b.contrato_fim)??99999)); const critical=rows.filter(r=>{const d=daysUntil(r.contrato_fim); return typeof d==='number' && d<=60;}); return `<div class="drawerBody"><div class="drawerNote"><b>Atenção:</b> lista prioriza contratos vencidos ou com até 60 dias para vencimento.</div>${(currentQuery?rows.filter(r=>match(`${r.prestador} ${r.municipio} ${r.servico} ${r.numero_contrato}`)):critical).map(r=>`<button class="drawerOption ${daysUntil(r.contrato_fim)<0?'danger':daysUntil(r.contrato_fim)<=60?'attention':''}" onclick='selectRows(${JSON.stringify({title:r.prestador, subtitle:`Vigência do serviço ${r.servico}`, rows:[r], sourcePanel:'vigencias'})})'><strong>${esc(r.prestador)}</strong><span>${esc(r.municipio)} • ${esc(r.servico)} • ${esc(r.numero_contrato||'-')} • ${esc(brDate(r.contrato_fim))} • ${esc(statusContrato(r).text)}</span></button>`).join('')||'<div class="drawerNote">Nenhuma vigência crítica encontrada.</div>'}</div>`; }
function bloqueiosDrawer(){ const rows=blockedServices().filter(r=>!currentQuery||match(`${r.prestador} ${r.municipio} ${r.servico} ${r.motivo_bloqueio}`)); return `${searchInput('Buscar bloqueio')}<div class="drawerBody">${rows.map(r=>`<button class="drawerOption danger" onclick='selectRows(${JSON.stringify({title:r.servico, subtitle:`Bloqueio em ${r.municipio}`, rows:[r], sourcePanel:'bloqueios'})})'><strong>${esc(r.prestador)}</strong><span>${esc(r.municipio)} • ${esc(r.servico)} • ${esc(r.motivo_bloqueio||'Serviço bloqueado')}</span></button>`).join('')||'<div class="drawerNote">Nenhum serviço bloqueado.</div>'}</div>`; }
function panoramaDrawer(){
  const rows=flat(); const byNature=group(rows,'natureza'); const macros=['Macro 1','Macro 2'].map(macroResumo);
  return `<div class="drawerBody"><div class="macroCard"><strong>Panorama geral</strong><span>${stats().prestadores} prestadores • ${stats().servicos} instrumentos/serviços • ${stats().municipios} municípios • ${stats().procedimentos} procedimentos vinculados</span><div class="macroNumbers"><b>${stats().bloqueados}</b><small>bloqueios</small><b>${fmt(stats().oferta)}</b><small>ofertas</small></div></div>
  <h3 class="drawerSectionTitle">Macrorregiões de saúde</h3>
  ${macros.map(m=>`<button class="drawerOption macroServiceCard" onclick='selectRows(${JSON.stringify({title:m.macro, subtitle:`${m.municipios.length} município(s) com dados • ${m.prestadores} prestador(es) • ${m.servicos} serviço(s)`, rows:m.rows, sourcePanel:'panorama'})})'><strong>${esc(m.macro)}</strong><span>${m.municipios.length} município(s) • ${m.prestadores} prestador(es) • ${m.servicos} serviço(s) • ${m.bloqueados} bloqueio(s)</span></button>`).join('')}
  <h3 class="drawerSectionTitle">Municípios por macrorregião</h3>
  ${macros.map(m=>`<div class="drawerNote"><b>${esc(m.macro)}:</b> ${esc(m.municipios.join(' • ') || 'Nenhum município da base SIGOA encontrado nesta macro.')}</div>`).join('')}
  <h3 class="drawerSectionTitle">Por natureza</h3>${Object.entries(byNature).map(([n,c])=>`<button class="drawerOption" onclick='selectRows(${JSON.stringify({title:naturezaLabel(n), subtitle:'Prestadores por natureza jurídica/instrumento', rows:rows.filter(r=>r.natureza===n), sourcePanel:'panorama'})})'><strong>${esc(naturezaLabel(n))}</strong><span>${c} registro(s)</span></button>`).join('')}</div>`;
}


function relatoriosDrawer(){
  const rows = flat();
  return `<div class="drawerBody">
    <div class="drawerNote"><b>Relatórios de consulta:</b> exibem apenas Prestador, Tipo de Serviço e Teto Mensal na competência ${esc(competenciaLabel(DATA?.competencia||monthNow()))}.</div>
    <button class="drawerOption" onclick='selectRows(${JSON.stringify({title:'Tetos mensais da rede executora', subtitle:'Prestador, tipo de serviço, valor global e teto físico mensal consolidado.', rows:rows, sourcePanel:'relatorios'})})'><strong>Tetos mensais da rede executora</strong><span>${rows.length} registro(s) • impressão e CSV</span></button>
    <button class="drawerOption" onclick="openGroupedReport('Prestadores por município','Prestador, serviço e teto mensal consolidado por município.', reportByMunicipio())"><strong>Prestadores por município</strong><span>${municipios().length} município(s)</span></button>
    <button class="drawerOption" onclick="openGroupedReport('Serviços ofertados','Prestadores e tetos mensais por tipo de serviço.', reportByServico())"><strong>Serviços ofertados</strong><span>${servicos().length} serviço(s)</span></button>
    <button class="drawerOption macroServiceCard" onclick="openGroupedReport('Panorama por macrorregião','Resumo dividido em Macro 1 e Macro 2.', reportByMacro())"><strong>Panorama por macrorregião</strong><span>Macro 1 e Macro 2</span></button>
  </div>`;
}
function reportByMunicipio(){ return municipios().map(m => ({titulo:m, linhas:rowsByMunicipio(m).map(rowResumoTexto)})); }
function reportByServico(){ return servicos().map(s => ({titulo:s, linhas:rowsByServico(s).map(rowResumoTexto)})); }
function reportProcedimentosPrestador(){ return prestadores().map(p => { const d=providerDetail(p); return {titulo:p, subtitulo:d.municipio, linhas:d.procedimentos.length?d.procedimentos:['Nenhum procedimento cadastrado.']}; }); }
function reportResumoProcedimentos(){
  const mapa = new Map();
  procFlat().forEach(p => {
    const codigo = String(p.codigo || '').trim();
    const nome = String(p.nome || 'Procedimento não informado').trim();
    const chave = `${codigo}|${norm(nome)}`;
    if(!mapa.has(chave)){
      mapa.set(chave, { codigo, nome, total:0, prestadores:new Set(), municipios:new Set(), servicos:new Set() });
    }
    const item = mapa.get(chave);
    const qtd = p.oferta === '-' ? 0 : Number(p.oferta || 0);
    item.total += Number.isFinite(qtd) ? qtd : 0;
    if(p.prestador) item.prestadores.add(p.prestador);
    if(p.municipio) item.municipios.add(p.municipio);
    if(p.servico) item.servicos.add(p.servico);
  });
  const itens = [...mapa.values()].sort((a,b)=>b.total-a.total || a.nome.localeCompare(b.nome,'pt-BR'));
  return itens.map(x => ({
    titulo: `${x.codigo ? x.codigo + ' - ' : ''}${x.nome}`,
    subtitulo: `Total ofertado: ${fmt(x.total)} • ${x.prestadores.size} prestador(es) • ${x.municipios.size} município(s)`,
    linhas: [
      `Total do procedimento: ${fmt(x.total)}`,
      `Prestadores vinculados: ${x.prestadores.size ? [...x.prestadores].sort((a,b)=>a.localeCompare(b,'pt-BR')).join(' • ') : 'Nenhum prestador vinculado'}`,
      `Municípios: ${x.municipios.size ? [...x.municipios].sort((a,b)=>a.localeCompare(b,'pt-BR')).join(' • ') : 'Nenhum município informado'}`,
      `Serviços relacionados: ${x.servicos.size ? [...x.servicos].sort((a,b)=>a.localeCompare(b,'pt-BR')).join(' • ') : 'Nenhum serviço informado'}`
    ]
  }));
}
function reportByNatureza(){ const rows=flat(); const naturezas=uniq(rows.map(r=>naturezaLabel(r.natureza))); return naturezas.map(n => ({titulo:n, linhas:rows.filter(r=>naturezaLabel(r.natureza)===n).map(r=>`${r.prestador} • ${r.municipio} • ${r.servico}`)})); }
function reportByMacro(){ return ['Macro 1','Macro 2'].map(m=>{ const resumo=macroResumo(m); return {titulo:m, subtitulo:`${resumo.municipios.length} município(s) • ${resumo.prestadores} prestador(es) • ${resumo.servicos} serviço(s)`, linhas:resumo.rows.map(rowResumoTexto)}; }); }
function openGroupedReport(title, subtitle, grupos){
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;color:#0b3354;background:#f3f7fb;margin:0}.page{max-width:1040px;margin:0 auto;padding:22px}.cover{background:linear-gradient(135deg,#0b3354,#1d6b91);color:#fff;border-radius:18px;padding:24px;margin-bottom:16px}.card{background:#fff;border:1px solid #d9e6ef;border-radius:16px;padding:14px;margin:0 0 12px;break-inside:avoid}h1{margin:4px 0 8px}h2{font-size:17px;margin:0 0 4px}.muted{color:#587086}li{margin:5px 0}@media print{body{background:#fff}.page{padding:0}}</style></head><body><div class="page"><section class="cover"><b>REDE EXECUTORA • CREG/RO</b><h1>${esc(title)}</h1><p>${esc(subtitle)} • Competência ${esc(competenciaLabel(DATA?.competencia||monthNow()))} • Emitido em ${new Date().toLocaleString('pt-BR')}</p></section>${grupos.map(g=>`<section class="card"><h2>${esc(g.titulo)}</h2>${g.subtitulo?`<p class="muted">${esc(g.subtitulo)}</p>`:''}<ol>${(g.linhas||[]).map(l=>`<li>${esc(l)}</li>`).join('')}</ol></section>`).join('')}</div><script>window.onload=()=>setTimeout(()=>window.print(),200)</script></body></html>`;
  const w=window.open('','_blank'); w.document.open(); w.document.write(html); w.document.close();
}
function downloadSelectionCSV(){
  if(!selection) return;
  const header=['prestador','tipo_servico','valor_global_contrato','teto_fisico_mensal'];
  const lines=[header.join(';')].concat(selection.rows.map(r=>[r.prestador||'',r.servico||'',valorContratoLabel(r),tetoLabel(r)].map(v=>String(v).replace(/;/g,',')).join(';')));
  const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=(selection.title||'relatorio').toLowerCase().replace(/[^a-z0-9]+/gi,'-')+'.csv'; a.click(); URL.revokeObjectURL(a.href);
}

function providerDrawerHtml(nome){ const d=providerDetail(nome); return `<div class="drawerBackdrop drawerOpen" onclick="closeProvider(event)"><aside class="drawer providerDrawer" onclick="event.stopPropagation()"><div class="drawerHeader"><div><div class="drawerNavRow"><button class="backButton" onclick="closeProvider()">← Voltar</button></div><span class="eyebrow">Consulta do prestador</span><h2>${esc(d.nome)}</h2><div class="providerMunicipioLine drawerProviderMunicipio"><span>Município:</span> <strong class="municipioStrong">${esc(d.municipio)}</strong></div></div><button class="iconButton" onclick="closeProvider()">×</button></div><div class="drawerBody"><div class="drawerNote consultaOnly"><b>Painel apenas para consulta.</b><br>São exibidos prestador, tipo de serviço, valor global do contrato e teto físico mensal consolidado.</div><h3 class="drawerSectionTitle">Contratos e tetos por tipo de serviço</h3>${d.rede.length?d.rede.map(r=>`<div class="procedureLine"><b>${esc(r.servico||'-')}</b><br>Valor Global do Contrato: ${esc(valorContratoLabel(r))}<br>Teto Físico Mensal: ${esc(tetoLabel(r))}</div>`).join(''):'<div class="drawerNote">Nenhum serviço encontrado para este prestador.</div>'}</div></aside></div>`; }
function sendMapMunicipios(){ const frame=$('#sidebar-map-frame'); if(frame?.contentWindow) frame.contentWindow.postMessage({type:'RO_MUNICIPIOS_COM_OFERTA', municipios:municipios()}, '*'); }
async function reload(){ try{ const mes=getMes(); DATA=await apiPublic(mes); panel=null; currentQuery=''; render(); }catch(e){ app.innerHTML=`<div class="emptyProfessional"><div><h2>Erro ao carregar</h2><p>${esc(e.message)}</p></div></div>`; } }
function openPanel(p){ if(panel) panelHistory.push(panel); panel=p; currentQuery=''; render(); }
function closePanel(ev){ if(ev?.target && ev.target.closest && ev.target.closest('.drawer') && ev.currentTarget!==ev.target) return; panel=null; panelHistory=[]; currentQuery=''; render(); }
function backPanel(){ panel = panelHistory.pop() || null; currentQuery=''; render(); }
function selectRows(sel){ selection=sel; panel=null; currentQuery=''; render(); }
function backToPanel(){ if(selection?.sourcePanel){ panel=selection.sourcePanel; selection=null; currentQuery=''; render(); } }
function closeSelection(){ selection=null; currentQuery=''; render(); }
function openProvider(nome){ providerDrawer=dec(nome); currentQuery=''; render(); }
function closeProvider(ev){ if(ev?.target && ev.target.closest && ev.target.closest('.drawer') && ev.currentTarget!==ev.target) return; providerDrawer=null; currentQuery=''; render(); }
function printSelection(){ if(selection) openPrint(selection.title, selection.subtitle, selection.rows); }
function printProvider(nome){ const d=providerDetail(dec(nome)); openPrint(`Rol de procedimentos • ${d.nome}`, `Relatório individual do prestador ${d.nome}.`, d.rede); }
function openPrint(title, subtitle, rows){ const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;color:#0b3354;background:#f3f7fb;margin:0}.page{max-width:980px;margin:0 auto;padding:22px}.cover{background:linear-gradient(135deg,#0b3354,#1d6b91);color:#fff;border-radius:18px;padding:26px;margin-bottom:18px}.card{background:#fff;border:1px solid #d9e6ef;border-radius:16px;padding:16px;margin:0 0 10px;break-inside:avoid}h1{margin:12px 0 6px}.grid{display:grid;grid-template-columns:2fr 1.2fr 1.2fr 1fr;gap:8px}.head{font-weight:bold;color:#587086}</style></head><body><div class="page"><section class="cover"><b>REDE EXECUTORA • CREG/RO</b><h1>${esc(title)}</h1><p>${esc(subtitle)} • Competência ${esc(competenciaLabel(DATA?.competencia||monthNow()))} • Emitido em ${new Date().toLocaleString('pt-BR')}</p></section><section class="card"><div class="grid head"><div>Prestador</div><div>Tipo de serviço</div><div>Valor global</div><div>Teto físico mensal</div></div>${rows.map(r=>`<div class="grid"><div>${esc(r.prestador)}</div><div>${esc(r.servico||'-')}</div><div>${esc(valorContratoLabel(r))}</div><div>${esc(tetoLabel(r))}</div></div>`).join('')}</section></div><script>window.onload=()=>setTimeout(()=>window.print(),200)</script></body></html>`; const w=window.open('','_blank'); w.document.open(); w.document.write(html); w.document.close(); }


Object.assign(window, {
  openPanel, closePanel, backPanel, selectRows, backToPanel, closeSelection,
  openProvider, closeProvider, printSelection, printProvider, downloadSelectionCSV,
  openGroupedReport
});

reload();
