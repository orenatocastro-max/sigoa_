const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
let Pool = null;
try { Pool = require('pg').Pool; } catch(e) { Pool = null; }

let dbPool = null;
let STORE_CACHE = {};
const USE_DB = !!process.env.DATABASE_URL;

async function initDatabase(){
  if(!USE_DB) return;
  if(!Pool) throw new Error('DATABASE_URL foi configurada, mas o pacote pg não está instalado. Rode npm install.');
  dbPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await dbPool.query(`CREATE TABLE IF NOT EXISTS sigoa_store (nome TEXT PRIMARY KEY, dados JSONB NOT NULL, atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const { rows } = await dbPool.query('SELECT nome, dados FROM sigoa_store');
  rows.forEach(r => { STORE_CACHE[r.nome] = r.dados; });
  console.log('Banco PostgreSQL/Supabase conectado. Itens carregados:', rows.length);
}

function persistDb(nome, dados){
  if(!dbPool) return;
  dbPool.query(
    'INSERT INTO sigoa_store (nome, dados, atualizado_em) VALUES ($1, $2::jsonb, now()) ON CONFLICT (nome) DO UPDATE SET dados = EXCLUDED.dados, atualizado_em = now()',
    [nome, JSON.stringify(dados)]
  ).catch(err => console.error('Erro ao salvar no PostgreSQL:', nome, err.message));
}

const app = express();
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname,'data');
const PUBLIC_API_KEY = process.env.PUBLIC_API_KEY || 'REDE_EXECUTORA_2026';

app.set('trust proxy', 1);
app.use(express.json({limit:'10mb'}));
app.use(express.urlencoded({extended:true}));
app.use(session({
  name: 'sigoa.sid',
  secret: process.env.SESSION_SECRET || 'sigoa-dev-secret',
  resave:false,
  saveUninitialized:false,
  cookie:{httpOnly:true, sameSite:'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8*60*60*1000}
}));
app.use(express.static(path.join(__dirname,'public')));

const file = (n)=>path.join(DATA,n);
const read = (n, fallback)=>{
  if(USE_DB && Object.prototype.hasOwnProperty.call(STORE_CACHE,n)) return STORE_CACHE[n];
  try{return JSON.parse(fs.readFileSync(file(n),'utf8'));}catch(e){return fallback;}
};
const write = (n, v)=>{
  if(USE_DB){ STORE_CACHE[n]=v; persistDb(n,v); }
  if(!fs.existsSync(DATA)) fs.mkdirSync(DATA,{recursive:true});
  fs.writeFileSync(file(n), JSON.stringify(v,null,2));
};
const now = ()=>new Date().toISOString();
const uid = (p='id')=>`${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const onlyDigits = s => String(s||'').replace(/\D/g,'');

function bootstrap(){
  if(!fs.existsSync(DATA)) fs.mkdirSync(DATA,{recursive:true});
  if(!read('usuarios.json', null)){
    const users = [
      {id:uid('u'), nome:'Administrador', login:'admin', perfil:'ADMINISTRADOR', status:'ATIVO', senha:bcrypt.hashSync('admin123',10), trocarSenha:false},
      {id:uid('u'), nome:'Operador', login:'operador', perfil:'OPERADOR', status:'ATIVO', senha:bcrypt.hashSync('operador123',10), trocarSenha:false},
      {id:uid('u'), nome:'Auditor', login:'auditor', perfil:'AUDITOR', status:'ATIVO', senha:bcrypt.hashSync('auditor123',10), trocarSenha:false},
      {id:uid('u'), nome:'Gestão', login:'gestao', perfil:'GESTAO', status:'ATIVO', senha:bcrypt.hashSync('gestao123',10), trocarSenha:false}
    ]; write('usuarios.json', users);
  } else {
    const users = read('usuarios.json', []);
    let changed = false;
    users.forEach(u => { if(u.perfil === 'CONSULTA'){ u.perfil = 'GESTAO'; if(u.login === 'consulta') u.login = 'gestao'; if((u.nome||'').toUpperCase()==='CONSULTA') u.nome = 'Gestão'; changed = true; } });
    if(!users.some(u => u.login === 'gestao')){ users.push({id:uid('u'), nome:'Gestão', login:'gestao', perfil:'GESTAO', status:'ATIVO', senha:bcrypt.hashSync('gestao123',10), trocarSenha:false}); changed = true; }
    if(changed) write('usuarios.json', users);
  }
  if(!read('prestadores.json', null)){
    const rede = read('rede-inicial.json',{});
    const prestadores = [];
    Object.entries(rede).forEach(([municipio, itens])=>{
      (itens||[]).forEach(item=>{
        const nome = item.prestador;
        let p = prestadores.find(x=>x.nome===nome && x.municipio===municipio);
        if(!p){ p = {id:uid('p'), nome, municipio, cnpj:'', ativo:true, observacaoGeral:'', instrumentos:[]}; prestadores.push(p); }
        p.instrumentos.push({
          id: uid('i'), tipo: normInstrumento(item.natureza), natureza: normNatureza(item.natureza), numero: item.numero_contrato || (String(item.natureza||'').includes('PROPRIA')?'REDE PROPRIA':'NAO INFORMADO'), vigenciaInicio:'', vigenciaFim: brToIso(item.contrato_fim), servico: item.servico || 'NAO INFORMADO', ativo:true, bloqueado: !!item.bloqueado, motivoBloqueio: item.motivo_bloqueio || '', observacao: item.observacao || '', procedimentos: []
        });
      })
    });
    write('prestadores.json', prestadores);
  }
  ['ofertas.json','auditoria.json','competencias.json','escalas.json','tetos.json'].forEach(n=>{ if(!read(n, null)) write(n,[]); });
  syncAuxiliares();
}
function normNatureza(n){ n=String(n||'').toUpperCase(); if(n.includes('PROPRIA')) return 'REDE PROPRIA'; if(n.includes('PACT')) return 'PACTUACAO'; if(n.includes('CONVEN')) return 'CONVENIO'; if(n.includes('GESTAO')) return 'CONTRATO DE GESTAO'; return n||'CONTRATUALIZADA'; }
function normInstrumento(n){ const x=normNatureza(n); if(x==='REDE PROPRIA') return 'REDE PROPRIA'; if(x==='PACTUACAO') return 'PACTUACAO'; if(x==='CONVENIO') return 'CONVENIO'; if(x==='CONTRATO DE GESTAO') return 'CONTRATO DE GESTAO'; return 'CONTRATO'; }

function upperClean(v){ return String(v||'').trim().toUpperCase(); }
const AUX_TIPOS = {
  municipios: 'Municípios',
  tiposServico: 'Tipos de serviço',
  naturezas: 'Naturezas',
  tiposInstrumento: 'Tipos de instrumento',
  gruposProcedimento: 'Grupos de procedimento',
  motivosBloqueio: 'Motivos de bloqueio',
  situacoesVigencia: 'Situações de vigência'
};
const MUNICIPIOS_RO = ['ALTA FLORESTA D OESTE','ALTO ALEGRE DOS PARECIS','ALTO PARAÍSO','ALVORADA D OESTE','ARIQUEMES','BURITIS','CABIXI','CACAULÂNDIA','CACOAL','CAMPO NOVO DE RONDÔNIA','CANDEIAS DO JAMARI','CASTANHEIRAS','CEREJEIRAS','CHUPINGUAIA','COLORADO DO OESTE','CORUMBIARA','COSTA MARQUES','CUJUBIM','ESPIGÃO D OESTE','GOVERNADOR JORGE TEIXEIRA','GUAJARÁ-MIRIM','ITAPUÃ DO OESTE','JARU','JI-PARANÁ','MACHADINHO DO OESTE','MINISTRO ANDREAZZA','MIRANTE DA SERRA','MONTE NEGRO','NOVA BRASILÂNDIA D OESTE','NOVA MAMORÉ','NOVA UNIÃO','NOVO HORIZONTE DO OESTE','OURO PRETO DO OESTE','PARECIS','PIMENTA BUENO','PIMENTEIRAS DO OESTE','PORTO VELHO','PRESIDENTE MÉDICI','PRIMAVERA DE RONDÔNIA','RIO CRESPO','ROLIM DE MOURA','SANTA LUZIA D OESTE','SÃO FELIPE D OESTE','SÃO FRANCISCO DO GUAPORÉ','SÃO MIGUEL DO GUAPORÉ','SERINGUEIRAS','TEIXEIRÓPOLIS','THEOBROMA','URUPÁ','VALE DO ANARI','VALE DO PARAÍSO','VILHENA'];
function defaultAuxiliares(){ return {
  municipios: MUNICIPIOS_RO.map(nome=>({id:uid('aux'), nome, macro: macroByMunicipio(nome), ativo:true})),
  tiposServico: ['HOSPITAL GERAL','HOSPITAL ESPECIALIZADO','CLÍNICA','POLICLÍNICA','LABORATÓRIO','DIAGNÓSTICO POR IMAGEM','TERAPIA RENAL SUBSTITUTIVA','REABILITAÇÃO','CAPS','UPA','AMBULATÓRIO','SERVIÇO ESPECIALIZADO'].map(nome=>({id:uid('aux'), nome, ativo:true})),
  naturezas: ['REDE PROPRIA','CONTRATUALIZADA','CREDENCIADA','CONVENIO','PACTUACAO','CONTRATO DE GESTAO'].map(nome=>({id:uid('aux'), nome, ativo:true})),
  tiposInstrumento: ['CONTRATO','REDE PROPRIA','CONVENIO','PACTUACAO','CONTRATO DE GESTAO','TERMO DE CREDENCIAMENTO'].map(nome=>({id:uid('aux'), nome, ativo:true})),
  gruposProcedimento: ['DIAGNÓSTICO','CONSULTAS','CIRURGIAS','INTERNAÇÃO','TERAPIAS','REABILITAÇÃO','EXAMES LABORATORIAIS','IMAGEM','OUTROS'].map(nome=>({id:uid('aux'), nome, ativo:true})),
  motivosBloqueio: ['VIGÊNCIA EXPIRADA','PENDÊNCIA DOCUMENTAL','SUSPENSÃO CONTRATUAL','INATIVIDADE TEMPORÁRIA','AUDITORIA','DESCREDENCIAMENTO','OUTROS'].map(nome=>({id:uid('aux'), nome, ativo:true})),
  situacoesVigencia: ['VIGENTE','A VENCER','VENCIDO','BLOQUEADO','INATIVO'].map(nome=>({id:uid('aux'), nome, ativo:true}))
}; }
function macroByMunicipio(m){ const macro1=['ALTO PARAÍSO','ARIQUEMES','BURITIS','CACAULÂNDIA','CAMPO NOVO DE RONDÔNIA','CANDEIAS DO JAMARI','CUJUBIM','GOVERNADOR JORGE TEIXEIRA','GUAJARÁ-MIRIM','ITAPUÃ DO OESTE','JARU','MACHADINHO DO OESTE','MONTE NEGRO','NOVA MAMORÉ','PORTO VELHO','RIO CRESPO','THEOBROMA','VALE DO ANARI']; return macro1.includes(upperClean(m))?'Macro 1':'Macro 2'; }
function addAuxValue(tipo, nome, extra={}){ nome=upperClean(nome); if(!nome || !AUX_TIPOS[tipo]) return; const aux=read('auxiliares.json', defaultAuxiliares()); aux[tipo]=aux[tipo]||[]; let item=aux[tipo].find(x=>upperClean(x.nome)===nome); if(item){ if(extra.macro && !item.macro) item.macro=extra.macro; item.ativo=true; } else { item={id:uid('aux'), nome, ativo:true, ...extra}; aux[tipo].push(item); } write('auxiliares.json', aux); }
function syncAuxiliares(){ const aux=read('auxiliares.json', null) || defaultAuxiliares(); const ps=read('prestadores.json',[]); ps.forEach(p=>{ if(p.municipio){ const m=upperClean(p.municipio); aux.municipios=aux.municipios||[]; if(!aux.municipios.some(x=>upperClean(x.nome)===m)) aux.municipios.push({id:uid('aux'), nome:m, macro:macroByMunicipio(m), ativo:true}); } (p.instrumentos||[]).forEach(i=>{ [['tiposServico',i.servico],['naturezas',i.natureza],['tiposInstrumento',i.tipo],['motivosBloqueio',i.motivoBloqueio]].forEach(([t,v])=>{ const n=upperClean(v); if(n){ aux[t]=aux[t]||[]; if(!aux[t].some(x=>upperClean(x.nome)===n)) aux[t].push({id:uid('aux'), nome:n, ativo:true}); } }); (i.procedimentos||[]).forEach(pr=>{}); }); }); write('auxiliares.json', aux); }

function brToIso(d){ const m=String(d||'').trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if(!m) return ''; return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
function user(){return (req,res,next)=>next()}
function auth(req,res,next){ if(!req.session.user) return res.status(401).json({erro:'Não autenticado'}); next(); }
function roles(...r){ return (req,res,next)=>{ if(!req.session.user) return res.status(401).json({erro:'Não autenticado'}); if(!r.includes(req.session.user.perfil)) return res.status(403).json({erro:'Acesso negado'}); next(); } }
function canWrite(req,res,next){ return roles('ADMINISTRADOR','OPERADOR')(req,res,next); }
function canViewReports(req,res,next){ return roles('ADMINISTRADOR','AUDITOR','GESTAO')(req,res,next); }
function audit(req, acao, entidade, id, detalhes){
  const arr=read('auditoria.json',[]);
  arr.unshift({id:uid('a'), dataHora:now(), usuario:req.session.user?.login||'sistema', nome:req.session.user?.nome||'Sistema', perfil:req.session.user?.perfil||'SISTEMA', acao, entidade, entidadeId:id, detalhes, ip:req.ip});
  write('auditoria.json', arr);
}
function diff(oldObj,newObj,campos){ const out=[]; campos.forEach(c=>{ const a=oldObj?.[c]??''; const b=newObj?.[c]??''; if(JSON.stringify(a)!==JSON.stringify(b)) out.push({campo:c, anterior:a, novo:b}); }); return out; }
function findInstrumento(prestadores, pid, iid){ const p=prestadores.find(x=>x.id===pid); const i=p?.instrumentos.find(x=>x.id===iid); return {p,i}; }
function competenciaFechada(mes){ return read('competencias.json',[]).some(c=>c.mes===mes && c.status==='FECHADA'); }
function isAdminSession(req){ return req.session.user?.perfil==='ADMINISTRADOR'; }
function isOperadorSession(req){ return req.session.user?.perfil==='OPERADOR'; }
function operadorPrestadores(req){ const users=read('usuarios.json',[]); const u=users.find(x=>x.id===req.session.user?.id); return Array.isArray(u?.prestadoresVinculados)?u.prestadoresVinculados:[]; }
function prestadorPermitido(req, prestadorId){ if(!isOperadorSession(req)) return true; return operadorPrestadores(req).includes(prestadorId); }
function sortPrestadores(lista){
  return (lista||[]).map(p=>({...p, instrumentos:[...(p.instrumentos||[])].sort((a,b)=>String(a.servico||'').localeCompare(String(b.servico||''),'pt-BR')||String(a.numero||a.tipo||'').localeCompare(String(b.numero||b.tipo||''),'pt-BR')).map(i=>({...i, procedimentos:[...(i.procedimentos||[])].sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR')||String(a.codigo||'').localeCompare(String(b.codigo||''),'pt-BR'))}))})).sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR')||String(a.municipio||'').localeCompare(String(b.municipio||''),'pt-BR'));
}
function filtrarPrestadoresPorUsuario(req, ps){ if(!isOperadorSession(req)) return ps; const ids=new Set(operadorPrestadores(req)); return ps.filter(p=>ids.has(p.id)); }
function exigirPrestadorPermitido(req,res,prestadorId){ if(prestadorPermitido(req,prestadorId)) return true; res.status(403).json({erro:'Operador não vinculado a este prestador'}); return false; }
function marcarEscalaLancada(req, mes, prestador, instrumento){ if(!mes || !prestador) return; const escalas=read('escalas.json',[]); const iid=instrumento?.id||''; let e=escalas.find(x=>x.mes===mes && x.prestadorId===prestador.id && (x.instrumentoId||'')===iid); if(!e){ e={id:uid('esc'), mes, prestadorId:prestador.id, instrumentoId:iid}; escalas.push(e); } e.prestador=prestador.nome; e.municipio=prestador.municipio; e.servico=instrumento?.servico||''; e.instrumento=instrumento?.numero||instrumento?.tipo||''; e.status='LANÇADA'; e.operadorId=req.session.user?.id||''; e.operador=req.session.user?.nome||req.session.user?.login||''; e.login=req.session.user?.login||''; e.lancadaEm=now(); write('escalas.json',escalas); }

function mesDentro(mes, inicio, fim){
  mes = String(mes || new Date().toISOString().slice(0,7)).slice(0,7);
  inicio = String(inicio || '0000-00').slice(0,7);
  fim = String(fim || '9999-99').slice(0,7);
  return mes >= inicio && mes <= fim;
}
function tetosAtivos(mes){
  return read('tetos.json',[]).filter(t => t.ativo !== false && mesDentro(mes, t.inicio, t.fim));
}
function tetoServico(tetos, prestadorId, instrumentoId){
  return tetos.find(t => t.modalidade === 'SERVICO' && t.prestadorId === prestadorId && t.instrumentoId === instrumentoId) || null;
}
function tetoProcedimento(tetos, prestadorId, instrumentoId, codigo){
  return tetos.find(t => t.modalidade === 'PROCEDIMENTO' && t.prestadorId === prestadorId && t.instrumentoId === instrumentoId && onlyDigits(t.codigo) === onlyDigits(codigo)) || null;
}
function resumoTetosPorMes(mes){
  const ps=read('prestadores.json',[]), ofs=read('ofertas.json',[]).filter(o=>o.mes===mes), tetos=tetosAtivos(mes);
  const rows=[];
  ps.forEach(p => (p.instrumentos||[]).filter(i=>i.ativo!==false).forEach(i=>{
    const teto = tetoServico(tetos, p.id, i.id);
    const total = ofs.filter(o=>o.prestadorId===p.id && o.instrumentoId===i.id).reduce((s,o)=>s+Number(o.quantidade||0),0);
    if(teto || total>0){
      rows.push({
        mes, prestadorId:p.id, instrumentoId:i.id, prestador:p.nome, municipio:p.municipio, servico:i.servico||'-',
        tetoMensal:teto?Number(teto.quantidade||0):null, lancado:total,
        diferenca:teto? total-Number(teto.quantidade||0):null,
        percentual:teto && Number(teto.quantidade||0)>0 ? Math.round((total/Number(teto.quantidade||0))*10000)/100 : null,
        observacao:teto?.observacao||'', tetoId:teto?.id||''
      });
    }
  }));
  return rows;
}


bootstrap();

app.get('/',(req,res)=>res.redirect('/sigoa/'));
app.get('/api/health',(req,res)=>res.json({ok:true, storage: USE_DB ? 'postgres' : 'json', time: now()}));
app.get('/api/me',(req,res)=>res.json({user:req.session.user||null}));
app.post('/api/login',(req,res)=>{ const {login,senha}=req.body; const u=read('usuarios.json',[]).find(x=>x.login===login); if(!u || !bcrypt.compareSync(senha||'',u.senha)) return res.status(401).json({erro:'Login ou senha inválidos'}); if(u.status!=='ATIVO') return res.status(403).json({erro:'Usuário bloqueado ou inativo'}); req.session.user={id:u.id,nome:u.nome,login:u.login,perfil:u.perfil,trocarSenha:!!u.trocarSenha}; res.json({ok:true,user:req.session.user}); });
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.post('/api/minha-senha',auth,(req,res)=>{ const {senhaAtual,novaSenha}=req.body; const users=read('usuarios.json',[]); const u=users.find(x=>x.id===req.session.user.id); if(!bcrypt.compareSync(senhaAtual||'',u.senha)) return res.status(400).json({erro:'Senha atual incorreta'}); u.senha=bcrypt.hashSync(novaSenha||'',10); u.trocarSenha=false; write('usuarios.json',users); audit(req,'ALTERAR_PROPRIA_SENHA','usuario',u.id,[]); res.json({ok:true}); });


app.get('/api/auxiliares',auth,(req,res)=>res.json(read('auxiliares.json', defaultAuxiliares())));
app.post('/api/auxiliares/:tipo',canWrite,(req,res)=>{ const tipo=req.params.tipo; if(!AUX_TIPOS[tipo]) return res.status(400).json({erro:'Lista auxiliar inválida'}); const aux=read('auxiliares.json', defaultAuxiliares()); aux[tipo]=aux[tipo]||[]; const nome=upperClean(req.body.nome); if(!nome) return res.status(400).json({erro:'Informe o nome'}); let item=aux[tipo].find(x=>upperClean(x.nome)===nome); if(item){ item.ativo=true; if(tipo==='municipios') item.macro=req.body.macro||item.macro||macroByMunicipio(nome); } else { item={id:uid('aux'), nome, ativo:true}; if(tipo==='municipios') item.macro=req.body.macro||macroByMunicipio(nome); aux[tipo].push(item); } write('auxiliares.json', aux); audit(req,'CADASTRO_AUXILIAR','auxiliar',item.id,[{campo:tipo,novo:item.nome}]); res.json(item); });
app.put('/api/auxiliares/:tipo/:id',canWrite,(req,res)=>{ const tipo=req.params.tipo; if(!AUX_TIPOS[tipo]) return res.status(400).json({erro:'Lista auxiliar inválida'}); const aux=read('auxiliares.json', defaultAuxiliares()); const item=(aux[tipo]||[]).find(x=>x.id===req.params.id); if(!item) return res.status(404).json({erro:'Item não encontrado'}); const old={...item}; if(req.body.nome!==undefined)item.nome=upperClean(req.body.nome); if(req.body.ativo!==undefined)item.ativo=!!req.body.ativo; if(tipo==='municipios' && req.body.macro!==undefined)item.macro=req.body.macro; write('auxiliares.json', aux); audit(req,'ALTERAR_CADASTRO_AUXILIAR','auxiliar',item.id,diff(old,item,['nome','macro','ativo'])); res.json(item); });

app.get('/api/usuarios',roles('ADMINISTRADOR'),(req,res)=>res.json(read('usuarios.json',[]).map(({senha,...u})=>u)));
app.post('/api/usuarios',roles('ADMINISTRADOR'),(req,res)=>{ const users=read('usuarios.json',[]); if(users.some(u=>u.login===req.body.login)) return res.status(400).json({erro:'Login já existe'}); const u={id:uid('u'), nome:req.body.nome, login:req.body.login, perfil:req.body.perfil, status:'ATIVO', motivoBloqueio:'', prestadoresVinculados:Array.isArray(req.body.prestadoresVinculados)?req.body.prestadoresVinculados:[], senha:bcrypt.hashSync(req.body.senha||'123456',10), trocarSenha:true}; users.push(u); write('usuarios.json',users); audit(req,'CRIAR_USUARIO','usuario',u.id,[{campo:'login',novo:u.login},{campo:'perfil',novo:u.perfil}]); res.json({ok:true}); });
app.put('/api/usuarios/:id',roles('ADMINISTRADOR'),(req,res)=>{ const users=read('usuarios.json',[]); const u=users.find(x=>x.id===req.params.id); if(!u) return res.status(404).json({erro:'Não encontrado'}); const old={...u}; if(req.body.login!==undefined && req.body.login!==u.login){ if(users.some(x=>x.id!==u.id && x.login===req.body.login)) return res.status(400).json({erro:'Login já existe'}); u.login=req.body.login; } ['nome','perfil','status','motivoBloqueio'].forEach(c=>{ if(req.body[c]!==undefined) u[c]=req.body[c]; }); if(req.body.prestadoresVinculados!==undefined) u.prestadoresVinculados=Array.isArray(req.body.prestadoresVinculados)?req.body.prestadoresVinculados:[]; if(req.body.resetarSenha){ u.senha=bcrypt.hashSync(req.body.novaSenha||'123456',10); u.trocarSenha=true; }
 write('usuarios.json',users); const d=diff(old,u,['nome','login','perfil','status','motivoBloqueio','trocarSenha','prestadoresVinculados']); if(req.body.resetarSenha)d.push({campo:'senha',anterior:'******',novo:'senha resetada'}); audit(req,'ALTERAR_USUARIO','usuario',u.id,d); res.json({ok:true}); });

app.get('/api/prestadores',auth,(req,res)=>res.json(sortPrestadores(filtrarPrestadoresPorUsuario(req, read('prestadores.json',[])))));
app.get('/api/prestadores-todos',roles('ADMINISTRADOR','AUDITOR'),(req,res)=>res.json(sortPrestadores(read('prestadores.json',[]))));
app.post('/api/prestadores',roles('ADMINISTRADOR'),(req,res)=>{ const ps=read('prestadores.json',[]); const p={id:uid('p'),nome:req.body.nome||req.body.nomeFantasia||req.body.razaoSocial,razaoSocial:req.body.razaoSocial||req.body.nome||'',nomeFantasia:req.body.nomeFantasia||req.body.nome||'',municipio:req.body.municipio,cnpj:req.body.cnpj||'',cnes:req.body.cnes||'',endereco:req.body.endereco||'',responsavel:req.body.responsavel||'',telefone:req.body.telefone||'',email:req.body.email||'',contatoAdministrativo:req.body.contatoAdministrativo||'',ativo:true,observacaoGeral:req.body.observacaoGeral||'',instrumentos:[]}; ps.push(p); addAuxValue('municipios', p.municipio, {macro: macroByMunicipio(p.municipio)}); write('prestadores.json',ps); audit(req,'CRIAR_PRESTADOR','prestador',p.id,[{campo:'nome',novo:p.nome},{campo:'municipio',novo:p.municipio}]); res.json(p); });
app.put('/api/prestadores/:id',roles('ADMINISTRADOR'),(req,res)=>{ const ps=read('prestadores.json',[]); const p=ps.find(x=>x.id===req.params.id); if(!p) return res.status(404).json({erro:'Não encontrado'}); const old={...p}; ['nome','razaoSocial','nomeFantasia','municipio','cnpj','cnes','endereco','responsavel','telefone','email','contatoAdministrativo','ativo','observacaoGeral'].forEach(c=>{ if(req.body[c]!==undefined)p[c]=req.body[c]; }); addAuxValue('municipios', p.municipio, {macro: macroByMunicipio(p.municipio)}); write('prestadores.json',ps); audit(req,'ALTERAR_PRESTADOR','prestador',p.id,diff(old,p,['nome','razaoSocial','nomeFantasia','municipio','cnpj','cnes','endereco','responsavel','telefone','email','contatoAdministrativo','ativo','observacaoGeral'])); res.json(p); });
app.post('/api/prestadores/:id/instrumentos',roles('ADMINISTRADOR'),(req,res)=>{ if(!exigirPrestadorPermitido(req,res,req.params.id)) return; const ps=read('prestadores.json',[]); const p=ps.find(x=>x.id===req.params.id); if(!p) return res.status(404).json({erro:'Prestador não encontrado'}); const i={id:uid('i'), tipo:req.body.tipo||'CONTRATO', natureza:req.body.natureza||'CONTRATUALIZADA', numero:req.body.numero||'', vigenciaInicio:req.body.vigenciaInicio||'', vigenciaFim:req.body.vigenciaFim||'', servico:req.body.servico||'', valorGlobal:req.body.valorGlobal||req.body.valorGlobalContrato||'', modoLancamento:req.body.modoLancamento||'QUANTITATIVO', anexos:req.body.anexos||[], ativo:true, bloqueado:false, motivoBloqueio:'', observacao:req.body.observacao||'', procedimentos:[]}; p.instrumentos.push(i); addAuxValue('tiposInstrumento', i.tipo); addAuxValue('naturezas', i.natureza); addAuxValue('tiposServico', i.servico); write('prestadores.json',ps); audit(req,'CRIAR_INSTRUMENTO','instrumento',i.id,[{campo:'prestador',novo:p.nome},{campo:'servico',novo:i.servico},{campo:'numero',novo:i.numero}]); res.json(i); });
app.post('/api/prestadores/:id/instrumentos/:iid/duplicar',roles('ADMINISTRADOR'),(req,res)=>{ const ps=read('prestadores.json',[]); const {p,i}=findInstrumento(ps,req.params.id,req.params.iid); if(!i) return res.status(404).json({erro:'Instrumento não encontrado'}); const novo=JSON.parse(JSON.stringify(i)); novo.id=uid('i'); novo.numero=req.body.numero||''; novo.vigenciaInicio=req.body.vigenciaInicio||''; novo.vigenciaFim=req.body.vigenciaFim||''; novo.servico=req.body.servico||i.servico; p.instrumentos.push(novo); write('prestadores.json',ps); audit(req,'DUPLICAR_INSTRUMENTO','instrumento',novo.id,[{campo:'origem',novo:i.numero},{campo:'novo',novo:novo.numero}]); res.json(novo); });
app.put('/api/prestadores/:id/instrumentos/:iid',roles('ADMINISTRADOR'),(req,res)=>{ if(!exigirPrestadorPermitido(req,res,req.params.id)) return; const ps=read('prestadores.json',[]); const {i}=findInstrumento(ps,req.params.id,req.params.iid); if(!i) return res.status(404).json({erro:'Instrumento não encontrado'}); const old=JSON.parse(JSON.stringify(i)); ['tipo','natureza','numero','vigenciaInicio','vigenciaFim','servico','valorGlobal','valorGlobalContrato','modoLancamento','anexos','ativo','bloqueado','motivoBloqueio','observacao'].forEach(c=>{ if(req.body[c]!==undefined){ if(c==='valorGlobalContrato') i.valorGlobal=req.body[c]; else i[c]=req.body[c]; } }); addAuxValue('tiposInstrumento', i.tipo); addAuxValue('naturezas', i.natureza); addAuxValue('tiposServico', i.servico); addAuxValue('motivosBloqueio', i.motivoBloqueio); write('prestadores.json',ps); audit(req,'ALTERAR_INSTRUMENTO','instrumento',i.id,diff(old,i,['tipo','natureza','numero','vigenciaInicio','vigenciaFim','servico','valorGlobal','modoLancamento','anexos','ativo','bloqueado','motivoBloqueio','observacao'])); res.json(i); });

app.get('/api/sigtap',auth,(req,res)=>{ const q=String(req.query.q||'').toUpperCase(); let a=read('sigtap.json',[]); if(q) a=a.filter(x=>x.nome.includes(q)||String(x.codigo).includes(q)||String(x.grupo||'').includes(q)||String(x.subgrupo||'').includes(q)); a.sort((x,y)=>String(x.nome||'').localeCompare(String(y.nome||''),'pt-BR')||String(x.codigo||'').localeCompare(String(y.codigo||''),'pt-BR')); res.json(a); });
app.post('/api/sigtap',roles('ADMINISTRADOR'),(req,res)=>{ const a=read('sigtap.json',[]); if(a.some(x=>onlyDigits(x.codigo)===onlyDigits(req.body.codigo))) return res.status(400).json({erro:'Código SIGTAP já cadastrado'}); const p={codigo:req.body.codigo,nome:String(req.body.nome||'').toUpperCase(),grupo:req.body.grupo||'',subgrupo:req.body.subgrupo||'',ativo:true}; a.push(p); write('sigtap.json',a); audit(req,'CRIAR_SIGTAP','sigtap',p.codigo,[{campo:'procedimento',novo:p.nome}]); res.json(p); });
app.post('/api/prestadores/:pid/instrumentos/:iid/procedimentos',roles('ADMINISTRADOR'),(req,res)=>{ if(!exigirPrestadorPermitido(req,res,req.params.pid)) return; const ps=read('prestadores.json',[]); const {p,i}=findInstrumento(ps,req.params.pid,req.params.iid); if(!i) return res.status(404).json({erro:'Instrumento não encontrado'}); const cod=String(req.body.codigo||''); if(!cod || !req.body.nome) return res.status(400).json({erro:'Informe o procedimento'}); if(i.procedimentos.some(p=>onlyDigits(p.codigo)===onlyDigits(cod))) return res.status(400).json({erro:'Procedimento já vinculado a este instrumento/serviço'}); const proc={codigo:cod,nome:req.body.nome,ativo:true}; i.procedimentos.push(proc); write('prestadores.json',ps); audit(req,'VINCULAR_PROCEDIMENTO','instrumento',i.id,[{campo:'prestador',novo:p?.nome||''},{campo:'servico',novo:i.servico||''},{campo:'procedimento',novo:`${proc.codigo} - ${proc.nome}`}]); res.json(proc); });
app.put('/api/prestadores/:pid/instrumentos/:iid/procedimentos/:codigo',roles('ADMINISTRADOR'),(req,res)=>{ const ps=read('prestadores.json',[]); const {i}=findInstrumento(ps,req.params.pid,req.params.iid); const proc=i?.procedimentos.find(p=>onlyDigits(p.codigo)===onlyDigits(req.params.codigo)); if(!proc)return res.status(404).json({erro:'Procedimento não encontrado'}); const old={...proc}; if(req.body.ativo!==undefined) proc.ativo=req.body.ativo; write('prestadores.json',ps); audit(req,'ALTERAR_PROCEDIMENTO_VINCULADO','procedimento',proc.codigo,diff(old,proc,['ativo'])); res.json(proc); });

app.post('/api/ofertas/lote',canWrite,(req,res)=>{ const {mes,prestadorId,instrumentoId,itens,justificativa}=req.body; if(competenciaFechada(mes) && req.session.user.perfil!=='ADMINISTRADOR') return res.status(403).json({erro:'Competência fechada'}); const ps=read('prestadores.json',[]); const {p,i}=findInstrumento(ps,prestadorId,instrumentoId); if(!i) return res.status(404).json({erro:'Instrumento não encontrado'}); if(!exigirPrestadorPermitido(req,res,prestadorId)) return; const ofs=read('ofertas.json',[]); (itens||[]).forEach(item=>{ const qtd=Number(item.quantidade||0); let o=ofs.find(x=>x.mes===mes&&x.prestadorId===prestadorId&&x.instrumentoId===instrumentoId&&onlyDigits(x.codigo)===onlyDigits(item.codigo)); const anterior=o?Number(o.quantidade||0):0; if(!o){ o={id:uid('o'),mes,prestadorId,instrumentoId,prestador:p.nome,municipio:p.municipio,servico:i.servico,codigo:item.codigo,nome:item.nome,quantidade:0,criadoPor:req.session.user.login,criadoEm:now(),alteradoPor:'',alteradoEm:'',observacao:''}; ofs.push(o); }
      if(anterior!==qtd || (item.observacao||'')!==(o.observacao||'')){
        const detalhes=[]; if(anterior!==qtd) detalhes.push({campo:'quantidade',anterior,novo:qtd}); if((item.observacao||'')!==(o.observacao||'')) detalhes.push({campo:'observacao',anterior:o.observacao||'',novo:item.observacao||''}); if(justificativa) detalhes.push({campo:'justificativa',novo:justificativa});
        o.quantidade=qtd; o.observacao=item.observacao||''; o.alteradoPor=req.session.user.login; o.alteradoEm=now();
        audit(req, anterior===0 && qtd>0 ? 'LANÇAR_OFERTA':'ALTERAR_OFERTA','oferta',o.id,[{campo:'prestador',novo:p.nome},{campo:'procedimento',novo:o.nome},{campo:'mes',novo:mes},...detalhes]);
      }
  }); write('ofertas.json',ofs); marcarEscalaLancada(req, mes, p, i); audit(req,'ESCALA_LANÇADA','instrumento',instrumentoId,[{campo:'prestador',novo:p.nome},{campo:'mes',novo:mes},{campo:'total_prestador_mes',novo:ofs.filter(x=>x.mes===mes&&x.prestadorId===prestadorId).reduce((sum,x)=>sum+Number(x.quantidade||0),0)}]); res.json({ok:true, totalPrestadorMes: ofs.filter(x=>x.mes===mes&&x.prestadorId===prestadorId).reduce((sum,x)=>sum+Number(x.quantidade||0),0)}); });
app.get('/api/ofertas',auth,(req,res)=>{ const {mes}=req.query; let a=read('ofertas.json',[]); if(isOperadorSession(req)){ const ids=new Set(operadorPrestadores(req)); a=a.filter(x=>ids.has(x.prestadorId)); } if(mes)a=a.filter(x=>x.mes===mes); res.json(a); });

app.get('/api/tetos',auth,(req,res)=>{
  const {mes}=req.query;
  let tetos=read('tetos.json',[]);
  if(mes) tetos=tetos.filter(t=>mesDentro(String(mes).slice(0,7),t.inicio,t.fim));
  if(isOperadorSession(req)){ const ids=new Set(operadorPrestadores(req)); tetos=tetos.filter(t=>ids.has(t.prestadorId)); }
  res.json(tetos);
});
app.get('/api/tetos/resumo',auth,(req,res)=>{
  const mes=String(req.query.mes||new Date().toISOString().slice(0,7)).slice(0,7);
  let rows=resumoTetosPorMes(mes);
  if(isOperadorSession(req)){ const ids=new Set(operadorPrestadores(req)); rows=rows.filter(r=>ids.has(r.prestadorId)); }
  res.json(rows);
});
app.post('/api/tetos',roles('ADMINISTRADOR'),(req,res)=>{
  const ps=read('prestadores.json',[]); const {p,i}=findInstrumento(ps,req.body.prestadorId,req.body.instrumentoId);
  if(!p || !i) return res.status(404).json({erro:'Prestador/serviço não encontrado'});
  const modalidade=String(req.body.modalidade||'SERVICO').toUpperCase()==='PROCEDIMENTO'?'PROCEDIMENTO':'SERVICO';
  const quantidade=Number(req.body.quantidade||0);
  if(quantidade<0) return res.status(400).json({erro:'Informe um teto mensal válido'});
  if(modalidade==='PROCEDIMENTO' && !req.body.codigo) return res.status(400).json({erro:'Informe o procedimento'});
  const tetos=read('tetos.json',[]);
  const t={id:uid('teto'), modalidade, prestadorId:p.id, instrumentoId:i.id, prestador:p.nome, municipio:p.municipio, servico:i.servico||'', codigo:req.body.codigo||'', procedimento:req.body.procedimento||'', quantidade, inicio:String(req.body.inicio||new Date().toISOString().slice(0,7)).slice(0,7), fim:String(req.body.fim||'').slice(0,7), observacao:req.body.observacao||'', ativo:req.body.ativo!==false, criadoPor:req.session.user.login, criadoEm:now(), alteradoPor:'', alteradoEm:''};
  tetos.push(t); write('tetos.json',tetos); audit(req,'CRIAR_TETO','teto',t.id,[{campo:'prestador',novo:p.nome},{campo:'servico',novo:i.servico},{campo:'modalidade',novo:modalidade},{campo:'quantidade',novo:quantidade}]); res.json(t);
});
app.put('/api/tetos/:id',roles('ADMINISTRADOR'),(req,res)=>{
  const tetos=read('tetos.json',[]); const t=tetos.find(x=>x.id===req.params.id); if(!t) return res.status(404).json({erro:'Teto não encontrado'});
  const old={...t}; ['modalidade','prestadorId','instrumentoId','codigo','procedimento','inicio','fim','observacao','ativo'].forEach(c=>{ if(req.body[c]!==undefined)t[c]=req.body[c]; });
  if(req.body.quantidade!==undefined)t.quantidade=Number(req.body.quantidade||0);
  const ps=read('prestadores.json',[]); const {p,i}=findInstrumento(ps,t.prestadorId,t.instrumentoId);
  if(p){ t.prestador=p.nome; t.municipio=p.municipio; }
  if(i){ t.servico=i.servico||''; }
  t.alteradoPor=req.session.user.login; t.alteradoEm=now(); write('tetos.json',tetos); audit(req,'ALTERAR_TETO','teto',t.id,diff(old,t,['modalidade','prestadorId','instrumentoId','codigo','procedimento','quantidade','inicio','fim','observacao','ativo'])); res.json(t);
});


app.get('/api/escalas',auth,(req,res)=>{
  const mes=String(req.query.mes||new Date().toISOString().slice(0,7));
  const ps=filtrarPrestadoresPorUsuario(req, read('prestadores.json',[]));
  const escalas=read('escalas.json',[]).filter(e=>e.mes===mes);
  const ofs=read('ofertas.json',[]).filter(o=>o.mes===mes);
  const usuarios=read('usuarios.json',[]);
  const norm=s=>String(s||'').replace(/\D/g,'');
  const rows=[];
  ps.forEach(p=>{
    (p.instrumentos||[]).filter(i=>i.ativo!==false).forEach(i=>{
      const esc=escalas.find(e=>e.prestadorId===p.id && (e.instrumentoId||'')===i.id);
      const procs=(i.procedimentos||[]).filter(pr=>pr.ativo!==false);
      const total=ofs.filter(o=>o.prestadorId===p.id && o.instrumentoId===i.id).reduce((s,o)=>s+Number(o.quantidade||0),0);
      const subescalas=procs.map(pr=>{
        const o=ofs.find(x=>x.prestadorId===p.id && x.instrumentoId===i.id && norm(x.codigo)===norm(pr.codigo));
        const quantidade=Number(o?.quantidade||0);
        return {codigo:pr.codigo, nome:pr.nome, quantidade, preenchida:quantidade>0, observacao:o?.observacao||'', atualizadoEm:o?.alteradoEm||o?.criadoEm||''};
      });
      const preenchidas=subescalas.filter(x=>x.preenchida).length;
      let status='PENDENTE';
      if(!subescalas.length) status='SEM_SUBESCALA';
      else if(preenchidas===0) status='PENDENTE';
      else if(preenchidas<subescalas.length) status='PARCIAL';
      else status='COMPLETA';
      const operadorNome=esc?.operador || usuarios.filter(u=>(u.prestadoresVinculados||[]).includes(p.id)).map(u=>u.nome).join(', ');
      rows.push({mes, prestadorId:p.id, instrumentoId:i.id, prestador:p.nome, servico:i.servico||'-', instrumento:i.numero||i.tipo||'-', municipio:p.municipio, status, operador:operadorNome||'', lancadaEm:esc?.lancadaEm||'', totalOfertaMes:total, subescalas, totalSubescalas:subescalas.length, subescalasPreenchidas:preenchidas});
    });
  });
  rows.sort((a,b)=>String(a.prestador).localeCompare(String(b.prestador),'pt-BR') || String(a.servico).localeCompare(String(b.servico),'pt-BR'));
  res.json(rows);
});

function ofertasPeriodo(inicio,fim){ const ini=String(inicio||'0000-00').slice(0,7), fi=String(fim||'9999-99').slice(0,7); return read('ofertas.json',[]).filter(o=>o.mes>=ini && o.mes<=fi); }
app.get('/api/relatorios/resumo',canViewReports,(req,res)=>{ const a=ofertasPeriodo(req.query.inicio,req.query.fim); const proc={}, prest={}, mun={}, serv={}; a.forEach(o=>{ const q=Number(o.quantidade||0); proc[o.nome]=(proc[o.nome]||0)+q; prest[`${o.prestador} — ${o.servico||'-'}`]=(prest[`${o.prestador} — ${o.servico||'-'}`]||0)+q; mun[o.municipio]=(mun[o.municipio]||0)+q; serv[o.servico]=(serv[o.servico]||0)+q; }); res.json({total:a.reduce((s,o)=>s+Number(o.quantidade||0),0), porProcedimento:proc, porPrestador:prest, porMunicipio:mun, porServico:serv}); });
app.get('/api/relatorios/producao-operadores',canViewReports,(req,res)=>{ const logs=read('auditoria.json',[]).filter(l=>(!req.query.inicio||l.dataHora>=req.query.inicio)&&(!req.query.fim||l.dataHora<=req.query.fim+'T23:59:59')); const out={}; logs.forEach(l=>{ if(!out[l.usuario]) out[l.usuario]={usuario:l.usuario,nome:l.nome,total:0,acoes:{}}; out[l.usuario].total++; out[l.usuario].acoes[l.acao]=(out[l.usuario].acoes[l.acao]||0)+1; }); res.json(Object.values(out)); });
app.get('/api/relatorios/excel',canViewReports,(req,res)=>{ const a=ofertasPeriodo(req.query.inicio,req.query.fim); const wb=XLSX.utils.book_new(); const rows=a.map(o=>({Mes:o.mes,Municipio:o.municipio,Prestador:o.prestador,Servico:o.servico,Codigo_SIGTAP:o.codigo,Procedimento:o.nome,Quantidade:Number(o.quantidade||0),Ultima_Alteracao:o.alteradoEm,Usuario:o.alteradoPor})); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Ofertas'); const buf=XLSX.write(wb,{type:'buffer',bookType:'xlsx'}); res.setHeader('Content-Disposition','attachment; filename="sigoa_ofertas.xlsx"'); res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buf); });
app.get('/api/auditoria',roles('ADMINISTRADOR','AUDITOR'),(req,res)=>res.json(read('auditoria.json',[]).slice(0,1000)));
app.post('/api/competencias/:mes/fechar',roles('ADMINISTRADOR'),(req,res)=>{ const cs=read('competencias.json',[]); let c=cs.find(x=>x.mes===req.params.mes); if(!c){c={mes:req.params.mes}; cs.push(c)} c.status='FECHADA'; c.fechadoPor=req.session.user.login; c.fechadoEm=now(); write('competencias.json',cs); audit(req,'FECHAR_COMPETENCIA','competencia',req.params.mes,[{campo:'mes',novo:req.params.mes}]); res.json(c); });

function publicCheck(req,res,next){ if((req.headers['x-api-key']||req.query.key)!==PUBLIC_API_KEY) return res.status(401).json({erro:'API key inválida'}); next(); }

app.post('/api/public/rede-executora/prestadores/:id/bloqueio', publicCheck, (req,res)=>{ return res.status(403).json({erro:'Painel Rede Executora é apenas para consulta. Use o SIGOA administrativo.'});
  const ps=read('prestadores.json',[]);
  const p=ps.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({erro:'Prestador não encontrado'});
  const bloqueado = !!req.body.bloqueado;
  p.bloqueado = bloqueado;
  p.motivoBloqueio = bloqueado ? (req.body.motivoBloqueio || 'Prestador bloqueado') : '';
  (p.instrumentos||[]).forEach(i=>{ i.bloqueado=bloqueado; i.motivoBloqueio=p.motivoBloqueio; });
  write('prestadores.json',ps);
  audit(req, bloqueado?'BLOQUEAR_PRESTADOR':'DESBLOQUEAR_PRESTADOR','prestador',p.id,[{campo:'prestador',novo:p.nome},{campo:'motivo',novo:p.motivoBloqueio}]);
  res.json({ok:true, prestador:p});
});

app.post('/api/public/rede-executora/ofertas', publicCheck, (req,res)=>{ return res.status(403).json({erro:'Painel Rede Executora é apenas para consulta. Use o SIGOA administrativo.'});
  const {mes, prestadorId, instrumentoId, itens}=req.body;
  const ps=read('prestadores.json',[]);
  const {p,i}=findInstrumento(ps,prestadorId,instrumentoId);
  if(!p || !i) return res.status(404).json({erro:'Prestador/instrumento não encontrado'});
  if(p.bloqueado || i.bloqueado) return res.status(400).json({erro:'Prestador bloqueado para lançamento.'});
  const ofs=read('ofertas.json',[]);
  (itens||[]).forEach(item=>{
    const proc=(i.procedimentos||[]).find(pr=>onlyDigits(pr.codigo)===onlyDigits(item.codigo)) || {codigo:item.codigo,nome:item.nome};
    const qtd=Number(item.quantidade||0);
    let o=ofs.find(x=>x.mes===mes&&x.prestadorId===prestadorId&&x.instrumentoId===instrumentoId&&onlyDigits(x.codigo)===onlyDigits(proc.codigo));
    if(!o){ o={id:uid('o'),mes,prestadorId,instrumentoId,prestador:p.nome,municipio:p.municipio,servico:i.servico,codigo:proc.codigo,nome:proc.nome,quantidade:0,criadoPor:'rede-executora',criadoEm:now(),alteradoPor:'',alteradoEm:'',observacao:''}; ofs.push(o); }
    o.quantidade=qtd; o.observacao=item.observacao||o.observacao||''; o.alteradoPor='rede-executora'; o.alteradoEm=now();
  });
  write('ofertas.json',ofs);
  audit(req,'LANÇAR_QUANTITATIVO_REDE','oferta',instrumentoId,[{campo:'prestador',novo:p.nome},{campo:'servico',novo:i.servico},{campo:'mes',novo:mes},{campo:'itens',novo:(itens||[]).length}]);
  res.json({ok:true});
});

app.get('/api/public/rede-executora', publicCheck, (req,res)=>{ const mes=String(req.query.mes||new Date().toISOString().slice(0,7)); const ps=read('prestadores.json',[]).sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR')); const ofs=read('ofertas.json',[]).filter(o=>o.mes===mes); const tetos=tetosAtivos(mes); const municipios={}; ps.filter(p=>p.ativo!==false).forEach(p=>{ (p.instrumentos||[]).filter(i=>i.ativo!==false).sort((a,b)=>String(a.servico||'').localeCompare(String(b.servico||''),'pt-BR')).forEach(i=>{ const teto=tetoServico(tetos,p.id,i.id); const lancado=ofs.filter(o=>o.prestadorId===p.id&&o.instrumentoId===i.id).reduce((s,o)=>s+Number(o.quantidade||0),0); const item={prestadorId:p.id, instrumentoId:i.id, municipio:p.municipio, prestador:p.nome, servico:i.servico, natureza:i.natureza, tipo:i.tipo, numero_contrato:i.numero, contrato_fim:i.vigenciaFim, bloqueado:!!(p.bloqueado||i.bloqueado), motivo_bloqueio:p.motivoBloqueio||i.motivoBloqueio||'', observacao:i.observacao||'', valorGlobalContrato:i.valorGlobal||i.valorGlobalContrato||'', tetoMensal:teto?Number(teto.quantidade||0):null, tetoObservacao:teto?.observacao||'', lancadoMensal:lancado, procedimentos:(i.procedimentos||[]).filter(pr=>pr.ativo!==false).sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR')).map(pr=>{ const o=ofs.find(x=>x.prestadorId===p.id&&x.instrumentoId===i.id&&onlyDigits(x.codigo)===onlyDigits(pr.codigo)); const tq=tetoProcedimento(tetos,p.id,i.id,pr.codigo); const q=o?Number(o.quantidade||0):null; return {codigo:pr.codigo,nome:pr.nome,oferta:q>0?q:'-', tetoMensal:tq?Number(tq.quantidade||0):null, tetoObservacao:tq?.observacao||'', instrumentoId:i.id, prestadorId:p.id, servico:i.servico}; })}; if(!municipios[p.municipio]) municipios[p.municipio]=[]; municipios[p.municipio].push(item); }); }); res.json({competencia:mes, ultimaAtualizacao:now(), municipios}); });

async function start(){
  try{
    await initDatabase();
    bootstrap();
    app.listen(PORT,()=>console.log('SIGOA rodando na porta '+PORT+' | armazenamento: '+(USE_DB?'PostgreSQL/Supabase':'JSON local')));
  }catch(e){
    console.error('Falha ao iniciar:', e);
    process.exit(1);
  }
}
start();
