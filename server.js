const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname,'data');
const PUBLIC_API_KEY = process.env.PUBLIC_API_KEY || 'REDE_EXECUTORA_2026';

app.use(express.json({limit:'10mb'}));
app.use(express.urlencoded({extended:true}));
app.use(session({secret: process.env.SESSION_SECRET || 'sigoa-dev-secret', resave:false, saveUninitialized:false, cookie:{maxAge: 8*60*60*1000}}));
app.use(express.static(path.join(__dirname,'public')));

const file = (n)=>path.join(DATA,n);
const read = (n, fallback)=>{ try{return JSON.parse(fs.readFileSync(file(n),'utf8'));}catch(e){return fallback;} };
const write = (n, v)=>fs.writeFileSync(file(n), JSON.stringify(v,null,2));
const now = ()=>new Date().toISOString();
const uid = (p='id')=>`${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const onlyDigits = s => String(s||'').replace(/\D/g,'');

function bootstrap(){
  if(!fs.existsSync(DATA)) fs.mkdirSync(DATA,{recursive:true});
  if(!fs.existsSync(file('usuarios.json'))){
    const users = [
      {id:uid('u'), nome:'Administrador', login:'admin', perfil:'ADMINISTRADOR', status:'ATIVO', senha:bcrypt.hashSync('admin123',10), trocarSenha:false},
      {id:uid('u'), nome:'Operador', login:'operador', perfil:'OPERADOR', status:'ATIVO', senha:bcrypt.hashSync('operador123',10), trocarSenha:false},
      {id:uid('u'), nome:'Auditor', login:'auditor', perfil:'AUDITOR', status:'ATIVO', senha:bcrypt.hashSync('auditor123',10), trocarSenha:false},
      {id:uid('u'), nome:'Consulta', login:'consulta', perfil:'CONSULTA', status:'ATIVO', senha:bcrypt.hashSync('consulta123',10), trocarSenha:false}
    ]; write('usuarios.json', users);
  }
  if(!fs.existsSync(file('prestadores.json'))){
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
  ['ofertas.json','auditoria.json','competencias.json'].forEach(n=>{ if(!fs.existsSync(file(n))) write(n,[]); });
}
function normNatureza(n){ n=String(n||'').toUpperCase(); if(n.includes('PROPRIA')) return 'REDE PROPRIA'; if(n.includes('PACT')) return 'PACTUACAO'; if(n.includes('CONVEN')) return 'CONVENIO'; if(n.includes('GESTAO')) return 'CONTRATO DE GESTAO'; return n||'CONTRATUALIZADA'; }
function normInstrumento(n){ const x=normNatureza(n); if(x==='REDE PROPRIA') return 'REDE PROPRIA'; if(x==='PACTUACAO') return 'PACTUACAO'; if(x==='CONVENIO') return 'CONVENIO'; if(x==='CONTRATO DE GESTAO') return 'CONTRATO DE GESTAO'; return 'CONTRATO'; }
function brToIso(d){ const m=String(d||'').trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if(!m) return ''; return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
function user(){return (req,res,next)=>next()}
function auth(req,res,next){ if(!req.session.user) return res.status(401).json({erro:'Não autenticado'}); next(); }
function roles(...r){ return (req,res,next)=>{ if(!req.session.user) return res.status(401).json({erro:'Não autenticado'}); if(!r.includes(req.session.user.perfil)) return res.status(403).json({erro:'Acesso negado'}); next(); } }
function canWrite(req,res,next){ return roles('ADMINISTRADOR','OPERADOR')(req,res,next); }
function audit(req, acao, entidade, id, detalhes){
  const arr=read('auditoria.json',[]);
  arr.unshift({id:uid('a'), dataHora:now(), usuario:req.session.user?.login||'sistema', nome:req.session.user?.nome||'Sistema', perfil:req.session.user?.perfil||'SISTEMA', acao, entidade, entidadeId:id, detalhes, ip:req.ip});
  write('auditoria.json', arr);
}
function diff(oldObj,newObj,campos){ const out=[]; campos.forEach(c=>{ const a=oldObj?.[c]??''; const b=newObj?.[c]??''; if(JSON.stringify(a)!==JSON.stringify(b)) out.push({campo:c, anterior:a, novo:b}); }); return out; }
function findInstrumento(prestadores, pid, iid){ const p=prestadores.find(x=>x.id===pid); const i=p?.instrumentos.find(x=>x.id===iid); return {p,i}; }
function competenciaFechada(mes){ return read('competencias.json',[]).some(c=>c.mes===mes && c.status==='FECHADA'); }

bootstrap();

app.get('/',(req,res)=>res.redirect('/sigoa/'));
app.get('/api/me',(req,res)=>res.json({user:req.session.user||null}));
app.post('/api/login',(req,res)=>{ const {login,senha}=req.body; const u=read('usuarios.json',[]).find(x=>x.login===login); if(!u || !bcrypt.compareSync(senha||'',u.senha)) return res.status(401).json({erro:'Login ou senha inválidos'}); if(u.status!=='ATIVO') return res.status(403).json({erro:'Usuário bloqueado ou inativo'}); req.session.user={id:u.id,nome:u.nome,login:u.login,perfil:u.perfil,trocarSenha:!!u.trocarSenha}; res.json({ok:true,user:req.session.user}); });
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.post('/api/minha-senha',auth,(req,res)=>{ const {senhaAtual,novaSenha}=req.body; const users=read('usuarios.json',[]); const u=users.find(x=>x.id===req.session.user.id); if(!bcrypt.compareSync(senhaAtual||'',u.senha)) return res.status(400).json({erro:'Senha atual incorreta'}); u.senha=bcrypt.hashSync(novaSenha||'',10); u.trocarSenha=false; write('usuarios.json',users); audit(req,'ALTERAR_PROPRIA_SENHA','usuario',u.id,[]); res.json({ok:true}); });

app.get('/api/usuarios',roles('ADMINISTRADOR'),(req,res)=>res.json(read('usuarios.json',[]).map(({senha,...u})=>u)));
app.post('/api/usuarios',roles('ADMINISTRADOR'),(req,res)=>{ const users=read('usuarios.json',[]); if(users.some(u=>u.login===req.body.login)) return res.status(400).json({erro:'Login já existe'}); const u={id:uid('u'), nome:req.body.nome, login:req.body.login, perfil:req.body.perfil, status:'ATIVO', motivoBloqueio:'', senha:bcrypt.hashSync(req.body.senha||'123456',10), trocarSenha:true}; users.push(u); write('usuarios.json',users); audit(req,'CRIAR_USUARIO','usuario',u.id,[{campo:'login',novo:u.login},{campo:'perfil',novo:u.perfil}]); res.json({ok:true}); });
app.put('/api/usuarios/:id',roles('ADMINISTRADOR'),(req,res)=>{ const users=read('usuarios.json',[]); const u=users.find(x=>x.id===req.params.id); if(!u) return res.status(404).json({erro:'Não encontrado'}); const old={...u}; ['nome','perfil','status','motivoBloqueio'].forEach(c=>{ if(req.body[c]!==undefined) u[c]=req.body[c]; }); if(req.body.resetarSenha){ u.senha=bcrypt.hashSync(req.body.novaSenha||'123456',10); u.trocarSenha=true; }
 write('usuarios.json',users); const d=diff(old,u,['nome','perfil','status','motivoBloqueio','trocarSenha']); if(req.body.resetarSenha)d.push({campo:'senha',anterior:'******',novo:'senha resetada'}); audit(req,'ALTERAR_USUARIO','usuario',u.id,d); res.json({ok:true}); });

app.get('/api/prestadores',auth,(req,res)=>res.json(read('prestadores.json',[])));
app.post('/api/prestadores',canWrite,(req,res)=>{ const ps=read('prestadores.json',[]); const p={id:uid('p'), nome:req.body.nome, municipio:req.body.municipio, cnpj:req.body.cnpj||'', ativo:true, observacaoGeral:req.body.observacaoGeral||'', instrumentos:[]}; ps.push(p); write('prestadores.json',ps); audit(req,'CRIAR_PRESTADOR','prestador',p.id,[{campo:'nome',novo:p.nome},{campo:'municipio',novo:p.municipio}]); res.json(p); });
app.put('/api/prestadores/:id',canWrite,(req,res)=>{ const ps=read('prestadores.json',[]); const p=ps.find(x=>x.id===req.params.id); if(!p) return res.status(404).json({erro:'Não encontrado'}); const old={...p}; ['nome','municipio','cnpj','ativo','observacaoGeral'].forEach(c=>{ if(req.body[c]!==undefined)p[c]=req.body[c]; }); write('prestadores.json',ps); audit(req,'ALTERAR_PRESTADOR','prestador',p.id,diff(old,p,['nome','municipio','cnpj','ativo','observacaoGeral'])); res.json(p); });
app.post('/api/prestadores/:id/instrumentos',canWrite,(req,res)=>{ const ps=read('prestadores.json',[]); const p=ps.find(x=>x.id===req.params.id); if(!p) return res.status(404).json({erro:'Prestador não encontrado'}); const i={id:uid('i'), tipo:req.body.tipo||'CONTRATO', natureza:req.body.natureza||'CONTRATUALIZADA', numero:req.body.numero||'', vigenciaInicio:req.body.vigenciaInicio||'', vigenciaFim:req.body.vigenciaFim||'', servico:req.body.servico||'', ativo:true, bloqueado:false, motivoBloqueio:'', observacao:req.body.observacao||'', procedimentos:[]}; p.instrumentos.push(i); write('prestadores.json',ps); audit(req,'CRIAR_INSTRUMENTO','instrumento',i.id,[{campo:'prestador',novo:p.nome},{campo:'servico',novo:i.servico},{campo:'numero',novo:i.numero}]); res.json(i); });
app.post('/api/prestadores/:id/instrumentos/:iid/duplicar',canWrite,(req,res)=>{ const ps=read('prestadores.json',[]); const {p,i}=findInstrumento(ps,req.params.id,req.params.iid); if(!i) return res.status(404).json({erro:'Instrumento não encontrado'}); const novo=JSON.parse(JSON.stringify(i)); novo.id=uid('i'); novo.numero=req.body.numero||''; novo.vigenciaInicio=req.body.vigenciaInicio||''; novo.vigenciaFim=req.body.vigenciaFim||''; novo.servico=req.body.servico||i.servico; p.instrumentos.push(novo); write('prestadores.json',ps); audit(req,'DUPLICAR_INSTRUMENTO','instrumento',novo.id,[{campo:'origem',novo:i.numero},{campo:'novo',novo:novo.numero}]); res.json(novo); });
app.put('/api/prestadores/:id/instrumentos/:iid',canWrite,(req,res)=>{ const ps=read('prestadores.json',[]); const {i}=findInstrumento(ps,req.params.id,req.params.iid); if(!i) return res.status(404).json({erro:'Instrumento não encontrado'}); const old=JSON.parse(JSON.stringify(i)); ['tipo','natureza','numero','vigenciaInicio','vigenciaFim','servico','ativo','bloqueado','motivoBloqueio','observacao'].forEach(c=>{ if(req.body[c]!==undefined)i[c]=req.body[c]; }); write('prestadores.json',ps); audit(req,'ALTERAR_INSTRUMENTO','instrumento',i.id,diff(old,i,['tipo','natureza','numero','vigenciaInicio','vigenciaFim','servico','ativo','bloqueado','motivoBloqueio','observacao'])); res.json(i); });

app.get('/api/sigtap',auth,(req,res)=>{ const q=String(req.query.q||'').toUpperCase(); let a=read('sigtap.json',[]); if(q) a=a.filter(x=>x.nome.includes(q)||String(x.codigo).includes(q)||String(x.grupo||'').includes(q)||String(x.subgrupo||'').includes(q)); res.json(a); });
app.post('/api/sigtap',canWrite,(req,res)=>{ const a=read('sigtap.json',[]); if(a.some(x=>onlyDigits(x.codigo)===onlyDigits(req.body.codigo))) return res.status(400).json({erro:'Código SIGTAP já cadastrado'}); const p={codigo:req.body.codigo,nome:String(req.body.nome||'').toUpperCase(),grupo:req.body.grupo||'',subgrupo:req.body.subgrupo||'',ativo:true}; a.push(p); write('sigtap.json',a); audit(req,'CRIAR_SIGTAP','sigtap',p.codigo,[{campo:'procedimento',novo:p.nome}]); res.json(p); });
app.post('/api/prestadores/:pid/instrumentos/:iid/procedimentos',canWrite,(req,res)=>{ const ps=read('prestadores.json',[]); const {i}=findInstrumento(ps,req.params.pid,req.params.iid); if(!i) return res.status(404).json({erro:'Instrumento não encontrado'}); const cod=String(req.body.codigo||''); if(i.procedimentos.some(p=>onlyDigits(p.codigo)===onlyDigits(cod))) return res.status(400).json({erro:'Procedimento já vinculado a este instrumento/serviço'}); const proc={codigo:cod,nome:req.body.nome,ativo:true}; i.procedimentos.push(proc); write('prestadores.json',ps); audit(req,'VINCULAR_PROCEDIMENTO','instrumento',i.id,[{campo:'procedimento',novo:`${proc.codigo} - ${proc.nome}`}]); res.json(proc); });
app.put('/api/prestadores/:pid/instrumentos/:iid/procedimentos/:codigo',canWrite,(req,res)=>{ const ps=read('prestadores.json',[]); const {i}=findInstrumento(ps,req.params.pid,req.params.iid); const proc=i?.procedimentos.find(p=>onlyDigits(p.codigo)===onlyDigits(req.params.codigo)); if(!proc)return res.status(404).json({erro:'Procedimento não encontrado'}); const old={...proc}; if(req.body.ativo!==undefined) proc.ativo=req.body.ativo; write('prestadores.json',ps); audit(req,'ALTERAR_PROCEDIMENTO_VINCULADO','procedimento',proc.codigo,diff(old,proc,['ativo'])); res.json(proc); });

app.post('/api/ofertas/lote',canWrite,(req,res)=>{ const {mes,prestadorId,instrumentoId,itens,justificativa}=req.body; if(competenciaFechada(mes) && req.session.user.perfil!=='ADMINISTRADOR') return res.status(403).json({erro:'Competência fechada'}); const ps=read('prestadores.json',[]); const {p,i}=findInstrumento(ps,prestadorId,instrumentoId); if(!i) return res.status(404).json({erro:'Instrumento não encontrado'}); const ofs=read('ofertas.json',[]); (itens||[]).forEach(item=>{ const qtd=Number(item.quantidade||0); let o=ofs.find(x=>x.mes===mes&&x.prestadorId===prestadorId&&x.instrumentoId===instrumentoId&&onlyDigits(x.codigo)===onlyDigits(item.codigo)); const anterior=o?Number(o.quantidade||0):0; if(!o){ o={id:uid('o'),mes,prestadorId,instrumentoId,prestador:p.nome,municipio:p.municipio,servico:i.servico,codigo:item.codigo,nome:item.nome,quantidade:0,criadoPor:req.session.user.login,criadoEm:now(),alteradoPor:'',alteradoEm:'',observacao:''}; ofs.push(o); }
      if(anterior!==qtd || (item.observacao||'')!==(o.observacao||'')){
        const detalhes=[]; if(anterior!==qtd) detalhes.push({campo:'quantidade',anterior,novo:qtd}); if((item.observacao||'')!==(o.observacao||'')) detalhes.push({campo:'observacao',anterior:o.observacao||'',novo:item.observacao||''}); if(justificativa) detalhes.push({campo:'justificativa',novo:justificativa});
        o.quantidade=qtd; o.observacao=item.observacao||''; o.alteradoPor=req.session.user.login; o.alteradoEm=now();
        audit(req, anterior===0 && qtd>0 ? 'LANÇAR_OFERTA':'ALTERAR_OFERTA','oferta',o.id,[{campo:'prestador',novo:p.nome},{campo:'procedimento',novo:o.nome},{campo:'mes',novo:mes},...detalhes]);
      }
  }); write('ofertas.json',ofs); res.json({ok:true}); });
app.get('/api/ofertas',auth,(req,res)=>{ const {mes}=req.query; let a=read('ofertas.json',[]); if(mes)a=a.filter(x=>x.mes===mes); res.json(a); });

function ofertasPeriodo(inicio,fim){ const ini=String(inicio||'0000-00').slice(0,7), fi=String(fim||'9999-99').slice(0,7); return read('ofertas.json',[]).filter(o=>o.mes>=ini && o.mes<=fi); }
app.get('/api/relatorios/resumo',roles('ADMINISTRADOR','AUDITOR'),(req,res)=>{ const a=ofertasPeriodo(req.query.inicio,req.query.fim); const proc={}, prest={}, mun={}, serv={}; a.forEach(o=>{ const q=Number(o.quantidade||0); proc[o.nome]=(proc[o.nome]||0)+q; prest[o.prestador]=(prest[o.prestador]||0)+q; mun[o.municipio]=(mun[o.municipio]||0)+q; serv[o.servico]=(serv[o.servico]||0)+q; }); res.json({total:a.reduce((s,o)=>s+Number(o.quantidade||0),0), porProcedimento:proc, porPrestador:prest, porMunicipio:mun, porServico:serv}); });
app.get('/api/relatorios/producao-operadores',roles('ADMINISTRADOR','AUDITOR'),(req,res)=>{ const logs=read('auditoria.json',[]).filter(l=>(!req.query.inicio||l.dataHora>=req.query.inicio)&&(!req.query.fim||l.dataHora<=req.query.fim+'T23:59:59')); const out={}; logs.forEach(l=>{ if(!out[l.usuario]) out[l.usuario]={usuario:l.usuario,nome:l.nome,total:0,acoes:{}}; out[l.usuario].total++; out[l.usuario].acoes[l.acao]=(out[l.usuario].acoes[l.acao]||0)+1; }); res.json(Object.values(out)); });
app.get('/api/relatorios/excel',roles('ADMINISTRADOR','AUDITOR'),(req,res)=>{ const a=ofertasPeriodo(req.query.inicio,req.query.fim); const wb=XLSX.utils.book_new(); const rows=a.map(o=>({Mes:o.mes,Municipio:o.municipio,Prestador:o.prestador,Servico:o.servico,Codigo_SIGTAP:o.codigo,Procedimento:o.nome,Quantidade:Number(o.quantidade||0),Ultima_Alteracao:o.alteradoEm,Usuario:o.alteradoPor})); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Ofertas'); const buf=XLSX.write(wb,{type:'buffer',bookType:'xlsx'}); res.setHeader('Content-Disposition','attachment; filename="sigoa_ofertas.xlsx"'); res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buf); });
app.get('/api/auditoria',roles('ADMINISTRADOR','AUDITOR'),(req,res)=>res.json(read('auditoria.json',[]).slice(0,1000)));
app.post('/api/competencias/:mes/fechar',roles('ADMINISTRADOR'),(req,res)=>{ const cs=read('competencias.json',[]); let c=cs.find(x=>x.mes===req.params.mes); if(!c){c={mes:req.params.mes}; cs.push(c)} c.status='FECHADA'; c.fechadoPor=req.session.user.login; c.fechadoEm=now(); write('competencias.json',cs); audit(req,'FECHAR_COMPETENCIA','competencia',req.params.mes,[{campo:'mes',novo:req.params.mes}]); res.json(c); });

function publicCheck(req,res,next){ if((req.headers['x-api-key']||req.query.key)!==PUBLIC_API_KEY) return res.status(401).json({erro:'API key inválida'}); next(); }
app.get('/api/public/rede-executora', publicCheck, (req,res)=>{ const mes=String(req.query.mes||new Date().toISOString().slice(0,7)); const ps=read('prestadores.json',[]); const ofs=read('ofertas.json',[]).filter(o=>o.mes===mes); const municipios={}; ps.filter(p=>p.ativo!==false).forEach(p=>{ p.instrumentos.filter(i=>i.ativo!==false).forEach(i=>{ const item={municipio:p.municipio, prestador:p.nome, servico:i.servico, natureza:i.natureza, tipo:i.tipo, numero_contrato:i.numero, contrato_fim:i.vigenciaFim, bloqueado:!!i.bloqueado, motivo_bloqueio:i.motivoBloqueio||'', observacao:i.observacao||'', procedimentos:(i.procedimentos||[]).filter(pr=>pr.ativo!==false).map(pr=>{ const o=ofs.find(x=>x.prestadorId===p.id&&x.instrumentoId===i.id&&onlyDigits(x.codigo)===onlyDigits(pr.codigo)); const q=o?Number(o.quantidade||0):null; return {codigo:pr.codigo,nome:pr.nome,oferta:q>0?q:'-'}; })}; if(!municipios[p.municipio]) municipios[p.municipio]=[]; municipios[p.municipio].push(item); }); }); res.json({competencia:mes, ultimaAtualizacao:now(), municipios}); });

app.listen(PORT,()=>console.log('SIGOA rodando na porta '+PORT));
