import { assertEquals, assert } from 'jsr:@std/assert@1'
import { shortCompany, greetingName, renderTemplate, matchProtectedCompany, inWindow, sendsThisTick, rankDomains } from './lib.ts'

Deno.test('short company names from the brief', () => {
  assertEquals(shortCompany('Automotores Gildemeister'), 'Gildemeister')
  assertEquals(shortCompany('Empresas Carozzi S.A.'), 'Carozzi')
  assertEquals(shortCompany('Forus S.A.'), 'Forus')
  assertEquals(shortCompany('Viña Concha y Toro'), 'Concha y Toro')
  assertEquals(shortCompany('HP'), 'HP')
  assertEquals(shortCompany('HUAU'), 'Huau')
  assertEquals(shortCompany('CCU'), 'CCU')
  assertEquals(shortCompany('WSA – WONDERFUL SOUND FOR ALL'), 'WSA')
  assertEquals(shortCompany('CAMBIASO HNOS S.A.C'), 'Cambiaso Hnos')
  assertEquals(shortCompany('Cámara Chilena de la Construcción', { camarachilenadelaconstruccion: 'CChC' }), 'CChC')
})

Deno.test('greeting keeps compound first names', () => {
  assertEquals(greetingName('Juan José'), 'Juan José')
  assertEquals(greetingName('María Ignacia'), 'María Ignacia')
  assertEquals(greetingName('Eduardo'), 'Eduardo')
})

Deno.test('never renders with empty variables', () => {
  const r = renderTemplate({ subject: 'Huau - {{empresa_corta}}', body: 'Hola, {{nombre}}.' }, { nombre: '', empresa_corta: 'Forus' })
  assertEquals(r.missing, ['nombre'])
  const ok = renderTemplate({ subject: 'Huau - {{empresa_corta}}', body: 'Hola, {{nombre}}. [REEL IA](https://youtu.be/x)' }, { nombre: 'Eduardo', empresa_corta: 'Forus' })
  assertEquals(ok.missing, [])
  assertEquals(ok.subject, 'Huau - Forus')
  assert(ok.html.includes('<a href="https://youtu.be/x">REEL IA</a>'))
})

Deno.test('Mall Plaza is excluded by domain and by name', () => {
  const list = [{ id: '1', nombre_comercial: 'Mall Plaza', razon_social: 'Plaza S.A.', dominio: 'mallplaza.cl', dominios_alt: ['mallplaza.com'], motivo: 'Cliente actual', estado: 'activa' }]
  assert(matchProtectedCompany(list, 'Otra', ['ana@mallplaza.cl']))
  assert(matchProtectedCompany(list, 'MALL PLAZA S.A.', ['ana@gmail.com']))
  assertEquals(matchProtectedCompany(list, 'Forus', ['ana@forus.cl']), null)
})

Deno.test('window is Mon-Fri 10:00-12:00 Chile', () => {
  const s = { send_days: [1, 2, 3, 4, 5], window_start: '10:00', window_end: '12:00' }
  assert(inWindow(s, new Date('2026-11-26T13:30:00Z'))) // Thu 10:30 CLST (UTC-3)
  assert(!inWindow(s, new Date('2026-11-26T15:30:00Z'))) // 12:30
  assert(!inWindow(s, new Date('2026-11-28T13:30:00Z'))) // Saturday
})

Deno.test('daily quota is never exceeded per tick', () => {
  assertEquals(sendsThisTick(0, 60, 5), 0)
  assertEquals(sendsThisTick(20, 120, 5), 3)
  assertEquals(sendsThisTick(2, 10, 5), 2)
})

Deno.test('finds the company domain from Gmail headers', () => {
  const h = ['Juan <juan@larrainvial.com>', 'Arturo <arturo@huau.cl>', 'ana@larrainvial.com, x@gmail.com', 'otro@agencia.cl']
  const r = rankDomains(h, 'Larrain Vial', new Set(['gmail.com', 'huau.cl']))
  assertEquals(r[0], { domain: 'larrainvial.com', hits: 2, matches_name: true })
  assertEquals(r.some((x) => x.domain === 'huau.cl' || x.domain === 'gmail.com'), false)
})

import { pickTemplate, resolveKind, canDeleteTemplate } from './lib.ts'
Deno.test('client template wins over general one', () => {
  const list = [{ kind: 'presentacion' }, { kind: 'reactivacion' }, { kind: 'c_banca', base_kind: 'presentacion', match_terms: ['Larrain Vial', 'bci.cl'] }]
  assertEquals(pickTemplate(list, 'presentacion', ['LARRAIN VIAL S.A.'], []), 'c_banca')
  assertEquals(pickTemplate(list, 'presentacion', ['Otra'], ['ana@bci.cl']), 'c_banca')
  assertEquals(pickTemplate(list, 'reactivacion', ['Larrain Vial'], []), 'reactivacion')
  assertEquals(pickTemplate(list, 'presentacion', ['Forus'], ['a@forus.cl']), 'presentacion')
})

Deno.test('renaming or deleting the general template never breaks sending', () => {
  // The general 'presentacion' row was renamed/deleted: the client template of the same base takes over.
  const list = [{ kind: 'c_banca', base_kind: 'presentacion', match_terms: [] }, { kind: 'reactivacion' }]
  assertEquals(resolveKind(list, 'presentacion'), 'c_banca')
  assertEquals(resolveKind(list, 'reactivacion'), 'reactivacion')
  assertEquals(resolveKind(list, 'noexiste'), null)
  assertEquals(pickTemplate(list, 'presentacion', ['Forus'], []), 'c_banca')
})

Deno.test('the last template of a base cannot be deleted', () => {
  const list = [{ kind: 'presentacion' }, { kind: 'reactivacion' }, { kind: 'c_banca', base_kind: 'presentacion' }]
  assertEquals(canDeleteTemplate(list, 'presentacion'), true)   // c_banca still covers presentation
  assertEquals(canDeleteTemplate(list, 'c_banca'), true)        // general one remains
  assertEquals(canDeleteTemplate(list, 'reactivacion'), false)  // nothing else reactivates
  assertEquals(canDeleteTemplate(list, 'c_inexistente'), false)
})

Deno.test('pickTemplate by cargo: internal comms only', () => {
  const list = [{ kind: 'presentacion' }, { kind: 'c_ci', base_kind: 'presentacion', match_cargos: ['comunicaciones internas', 'cultura'] }]
  assertEquals(pickTemplate(list, 'presentacion', ['Forus'], [], 'Jefa de Comunicaciones Internas'), 'c_ci')
  assertEquals(pickTemplate(list, 'presentacion', ['Forus'], [], 'Gerente de Marketing'), 'presentacion')
  assertEquals(pickTemplate(list, 'presentacion', ['Forus'], [], null), 'presentacion')
  assertEquals(pickTemplate(list, 'reactivacion', ['Forus'], [], 'Subgerente de Cultura'), 'reactivacion')
})
