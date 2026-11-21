// Loads the general-election section (../elecciones/generales-2026/) at build time. Same strict
// rule as news.ts: a statement without a source, an unknown document id or an unreadable file is
// reported with warn(), and a production build fails.

import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import { ROOT, asList, warn } from './news';

export const ELECTION_DIR = 'elecciones/generales-2026';
export const BASE_ROUTE = '/eleccionesgenerales2026';

export interface Doc {
  titulo: string;
  url: string;
  fecha: string;
}

export interface Statement {
  texto: string;
  fuentes: Doc[];
}

export interface Proposal extends Statement {
  id: string;
  tema: string;
  referencia: string; // where in the programme, e.g. "Medida 144"
  requisitos: string[];
  viabilidad: Statement | null; // why those requisitos: the laws or articles involved
  antecedentes: (Statement & { tipo: 'a-favor' | 'en-contra'; fecha: string })[];
}

export interface Party {
  id: string;
  siglas: string;
  nombre: string;
  web: string | null;
  entidades: string[];
  candidato: Statement;
  candidaturas: Statement & { patron: string; lista: { provincia: string; nombre: string; compartida: boolean }[] };
  inclusion: Statement;
  composicion: Statement | null; // member parties of a coalition
  programa: (Doc & { presentado?: string }) | null;
  propuestas: Proposal[];
}

export interface Province {
  id: string;
  nombre: string;
  escanos_2026: number;
  escanos_2023: number;
  electores_2023: number;
  votantes_2023: number;
  validos_2023: number;
  candidaturas_2023: { siglas: string; votos: number; escanos: number }[];
  otros_2023: number;
  candidaturas_2026: string[];
}

export interface PactFact extends Statement {
  fecha: string;
  partes: string[];
  despues: Statement[]; // what followed: laws, bills, votes
}

export interface Pacts {
  regla: Statement;
  secciones: { id: string; titulo: string; intro: Statement | null; hechos: PactFact[]; nota: Statement | null }[];
  otros: {
    nota: Statement;
    partidos: { siglas: string; nombre: string; web: string | null; escanos2023: number; circunscripciones: string[] }[];
  };
}

export interface Election {
  titulo: string;
  fecha: string;
  congelado: string[];
  convocatoria: Statement;
  criterio: Statement;
  otros: Statement[];
  parties: Party[];
  temas: Record<string, string>;
  requisitos: Record<string, { titulo: string; texto: string; url: string }>;
  provinces: Province[];
  candidaturas2023: Record<string, string>;
  dataSources: Record<string, Doc>;
  metodologia: string; // rendered HTML
  pactos: Pacts | null;
}

function readYaml(file: string): any {
  try {
    return yaml.load(fs.readFileSync(path.join(ROOT, file), 'utf8'), { schema: yaml.JSON_SCHEMA }) ?? {};
  } catch (err) {
    warn(`${file}: cannot be read (${(err as Error).message.split('\n')[0]})`);
    return {};
  }
}

const str = (v: unknown) => (v == null ? '' : String(v).trim());

function statement(file: string, node: any, docs: Record<string, Doc>, label: string): Statement {
  const texto = str(node?.texto);
  const fuentes: Doc[] = [];
  for (const s of asList(node?.fuentes)) {
    if (typeof s === 'string') {
      if (docs[s]) fuentes.push(docs[s]);
      else warn(`${file}: ${label}: unknown document id '${s}'`);
    } else if (s?.url && s?.titulo) {
      fuentes.push({ titulo: str(s.titulo), url: str(s.url), fecha: str(s.fecha) });
    } else {
      warn(`${file}: ${label}: source without titulo and url`);
    }
  }
  if (texto && !fuentes.length) warn(`${file}: ${label}: statement without a source`);
  return { texto, fuentes };
}

function docMap(raw: any): Record<string, Doc> {
  const out: Record<string, Doc> = {};
  for (const [id, d] of Object.entries(raw ?? {}) as [string, any][]) {
    out[id] = { titulo: str(d?.titulo), url: str(d?.url), fecha: str(d?.fecha) };
  }
  return out;
}

function renderMarkdown(file: string): string {
  let markdown = '';
  try {
    markdown = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/^# .+\n/, '');
  } catch (err) {
    warn(`${file}: cannot be read (${(err as Error).message})`);
  }
  return String(
    unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeSlug).use(rehypeStringify).processSync(markdown),
  );
}

function load(): Election {
  const file = `${ELECTION_DIR}/eleccion.yaml`;
  const raw = readYaml(file);
  const docs = docMap(raw.documentos);

  const dataFile = `${ELECTION_DIR}/datos/circunscripciones.json`;
  let data: any = {};
  try {
    data = JSON.parse(fs.readFileSync(path.join(ROOT, dataFile), 'utf8'));
  } catch (err) {
    warn(`${dataFile}: cannot be read (${(err as Error).message})`);
  }
  const provinces: Province[] = asList(data.provincias);

  const partyDir = path.join(ROOT, ELECTION_DIR, 'partidos');
  const partyFiles = fs.existsSync(partyDir) ? fs.readdirSync(partyDir).filter((f) => f.endsWith('.yaml')).sort() : [];
  const parties: Party[] = partyFiles.map((name) => {
    const pfile = `${ELECTION_DIR}/partidos/${name}`;
    const p = readYaml(pfile);
    const all = { ...docs, ...docMap(p.documentos) };
    let pattern: RegExp | null = null;
    try {
      pattern = new RegExp(str(p.candidaturas_2026?.patron) || '(?!)', 'i');
    } catch {
      warn(`${pfile}: invalid candidaturas_2026.patron`);
    }
    const shared = p.candidaturas_2026?.compartida ? new RegExp(str(p.candidaturas_2026.compartida), 'i') : null;
    const lista = provinces.flatMap((prov) =>
      prov.candidaturas_2026
        .filter((c) => pattern?.test(c))
        .slice(0, 1)
        .map((c) => ({ provincia: prov.nombre, nombre: c, compartida: !!shared?.test(c) })),
    );
    const programa = p.programa?.documento ? all[p.programa.documento] : null;
    if (p.programa?.documento && !programa) warn(`${pfile}: programa.documento '${p.programa.documento}' not found`);
    return {
      id: str(p.id) || name.replace(/\.yaml$/, ''),
      siglas: str(p.siglas),
      nombre: str(p.nombre),
      web: p.web ? str(p.web) : null,
      entidades: asList(p.entidades).map(str),
      candidato: statement(pfile, p.candidato, all, 'candidato'),
      candidaturas: { ...statement(pfile, { texto: p.candidaturas_2026?.texto, fuentes: p.candidaturas_2026?.fuentes }, all, 'candidaturas_2026'),
        patron: str(p.candidaturas_2026?.patron), lista },
      inclusion: statement(pfile, p.inclusion, all, 'inclusion'),
      composicion: p.composicion ? statement(pfile, p.composicion, all, 'composicion') : null,
      programa: programa ? { ...programa, presentado: str(p.programa?.presentado) || undefined } : null,
      propuestas: asList(p.propuestas).map((prop: any, i: number) => ({
        ...statement(pfile, prop, all, `propuestas[${i}]`),
        id: str(prop.id),
        tema: str(prop.tema),
        referencia: str(prop.referencia),
        requisitos: asList(prop.requisitos).map(str),
        viabilidad: prop.viabilidad ? statement(pfile, prop.viabilidad, all, `propuestas[${i}].viabilidad`) : null,
        antecedentes: asList(prop.antecedentes).map((a: any, j: number) => ({
          ...statement(pfile, a, all, `propuestas[${i}].antecedentes[${j}]`),
          tipo: a.tipo === 'en-contra' ? 'en-contra' : 'a-favor',
          fecha: str(a.fecha),
        })),
      })),
    };
  });

  return {
    titulo: str(raw.titulo),
    fecha: str(raw.fecha),
    congelado: asList(raw.congelado).map(str),
    convocatoria: statement(file, raw.convocatoria, docs, 'convocatoria'),
    criterio: statement(file, raw.criterio, docs, 'criterio'),
    otros: asList(raw.otros_nacionales).map((o: any, i: number) => statement(file, o, docs, `otros_nacionales[${i}]`)),
    parties: parties.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    temas: readYaml(`${ELECTION_DIR}/temas.yaml`).temas ?? {},
    requisitos: readYaml(`${ELECTION_DIR}/requisitos.yaml`).requisitos ?? {},
    provinces: [...provinces].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    candidaturas2023: data.candidaturas ?? {},
    dataSources: docMap(data.fuentes),
    metodologia: renderMarkdown(`${ELECTION_DIR}/metodologia.md`),
    pactos: loadPacts(docs, provinces),
  };
}

function loadPacts(globalDocs: Record<string, Doc>, provinces: Province[]): Pacts | null {
  const file = `${ELECTION_DIR}/pactos.yaml`;
  if (!fs.existsSync(path.join(ROOT, file))) return null;
  const raw = readYaml(file);
  const docs = { ...globalDocs, ...docMap(raw.documentos) };
  const st = (node: any, label: string) => statement(file, node, docs, label);
  return {
    regla: st(raw.regla, 'regla'),
    secciones: asList(raw.secciones).map((s: any, i: number) => ({
      id: str(s.id),
      titulo: str(s.titulo),
      intro: s.intro ? st(s.intro, `secciones[${i}].intro`) : null,
      nota: s.nota ? st(s.nota, `secciones[${i}].nota`) : null,
      hechos: asList(s.hechos).map((h: any, j: number) => ({
        ...st(h, `secciones[${i}].hechos[${j}]`),
        fecha: str(h.fecha),
        partes: asList(h.partes).map(str),
        despues: asList(h.despues).map((d: any, k: number) => st(d, `secciones[${i}].hechos[${j}].despues[${k}]`)),
      })).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    })),
    otros: {
      nota: st(raw.otros_partidos?.nota, 'otros_partidos.nota'),
      partidos: asList(raw.otros_partidos?.partidos).map((p: any) => {
        const siglas2023 = new Set(asList(p.siglas_2023).map(str));
        const pattern = new RegExp(str(p.patron) || '(?!)', 'i');
        return {
          siglas: str(p.siglas),
          nombre: str(p.nombre),
          web: p.web ? str(p.web) : null,
          escanos2023: provinces.reduce((n, prov) =>
            n + asList(prov.candidaturas_2023).filter((c) => siglas2023.has(c.siglas)).reduce((m, c) => m + (c.escanos || 0), 0), 0),
          circunscripciones: provinces.filter((prov) => prov.candidaturas_2026.some((c) => pattern.test(c))).map((prov) => prov.nombre).sort((a, b) => a.localeCompare(b, 'es')),
        };
      }),
    },
  };
}

export interface SenateConstituency {
  nombre: string;
  provincia: string; // province id in circunscripciones.json
  isla: boolean;
  escanos_2023: number;
  candidatos: { nombre: string; candidatura: string; votos: number; electo: boolean }[];
}

/** 2023 Senate results per constituency (datos/senado.json, generated from BOE-A-2023-18907). */
export function getSenate(): { fuente: Doc | null; circunscripciones: SenateConstituency[] } {
  const file = path.join(ROOT, ELECTION_DIR, 'datos', 'senado.json');
  if (!fs.existsSync(file)) return { fuente: null, circunscripciones: [] };
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { fuente: docMap(data.fuentes).resultados_2023 ?? null, circunscripciones: asList(data.circunscripciones) };
}

export interface QuizOption {
  id: string;
  texto: string;
  /** Parties whose programme gives this answer, with the proposal it comes from. */
  partidos: { party: string; propuesta: string; texto: string }[];
}

export interface QuizQuestion {
  id: string;
  pregunta: string;
  /** The answers lie on one line, in order: the neighbouring answer scores half a point. */
  escala: boolean;
  opciones: QuizOption[];
}

/** The affinity quiz (afinidad.yaml); each party in an answer carries the text of its proposal. */
export function getQuiz(): QuizQuestion[] {
  const file = `${ELECTION_DIR}/afinidad.yaml`;
  if (!fs.existsSync(path.join(ROOT, file))) return [];
  const parties = new Map(getElection().parties.map((p) => [p.id, p]));
  return asList(readYaml(file).preguntas).map((q: any) => ({
    id: str(q.id),
    pregunta: str(q.pregunta),
    escala: q.escala === true,
    opciones: asList(q.opciones).map((o: any) => ({
      id: str(o.id),
      texto: str(o.texto),
      partidos: Object.entries(o.partidos ?? {}).flatMap(([party, id]) => {
        const prop = parties.get(party)?.propuestas.find((p) => p.id === str(id));
        if (!prop) {
          warn(`${file}: ${q.id}: ${party} has no propuesta '${id}'`);
          return [];
        }
        return [{ party, propuesta: prop.id, texto: prop.texto }];
      }),
    })),
  }));
}

let cached: Election | undefined;
export function getElection(): Election {
  return (cached ??= load());
}

/** Short label for a source link: the BOE id for BOE documents, otherwise the host name. */
export function sourceLabel(doc: Doc): string {
  const article = doc.url.match(/BOE-A-1978-31229#a(\d+)/);
  if (article) return `Constitución, art. ${article[1]}`;
  const boe = doc.url.match(/BOE-[A-Z]-\d{4}-\d+/);
  if (boe) return boe[0];
  try {
    return new URL(doc.url).hostname.replace(/^www\./, '');
  } catch {
    return doc.titulo;
  }
}

/** "52 de 52 circunscripciones", or "44 con lista propia y 5 en listas compartidas, de 52". */
export function candidacyCount(party: Party, total: number): string {
  const shared = party.candidaturas.lista.filter((c) => c.compartida).length;
  const own = party.candidaturas.lista.length - shared;
  if (!shared) return `${own} de ${total} circunscripciones`;
  return `${own} circunscripciones con lista propia y ${shared} en listas compartidas con otras fuerzas, de ${total}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('es-ES');
}
