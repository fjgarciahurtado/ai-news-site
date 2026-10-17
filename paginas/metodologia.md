# Metodología

Este sitio publica cada mañana un resumen de las noticias más importantes de España. Todo el
proceso es automático: lo escribe una IA (Claude, de Anthropic) a partir de lo que publican
medios españoles, y unas comprobaciones automáticas deciden qué se puede publicar. No hay
revisión humana antes de publicar. Si algo está mal, se corrige y queda registrado en
[Correcciones](correcciones.md).

## Cómo se hace cada resumen

1. **Recogida.** Cada dos horas se leen los canales RSS de los medios de la
   [lista de fuentes](politica-de-fuentes.md). Solo se usan medios de esa lista.
2. **Agrupación.** Las piezas de distintos medios sobre el mismo hecho se agrupan en una
   sola noticia, comparando sus titulares y entradillas.
3. **Importancia.** Pesa más una noticia cuantos más grupos editoriales independientes la
   cubren, cuantos más la llevan en portada y cuanto más amplio es el espectro político de
   los medios que la recogen. Medios del mismo grupo (por ejemplo, El País, Cinco Días y la
   SER) cuentan como uno.
4. **Redacción.** La IA elige entre 14 y 18 noticias y escribe para cada una un resumen con
   sus propias palabras, atribuyendo cada afirmación a quien la hace. Nunca reproduce
   artículos: solo citas breves y entrecomilladas.
5. **Verificación.** Se buscan verificaciones de medios de *fact-checking* y, en las
   noticias sobre declaraciones o cambios de postura de cargos públicos, antecedentes en
   documentos (BOE, Congreso, Moncloa, hemerotecas).
6. **Comprobaciones automáticas** antes de publicar (ver abajo). Si fallan, no se publica
   nada y sigue en línea el resumen anterior.

## Estados de verificación

| Estado | Significado |
|---|---|
| ✅ Verificada | La publican al menos dos grupos editoriales independientes, o una agencia de noticias. |
| ⚠️ Sin confirmar | Solo la publica un medio o un grupo y ninguna agencia. No significa que sea falsa. |
| ❓ Disputada | Hay versiones contradictorias entre fuentes fiables, o un verificador la califica de engañosa o parcialmente falsa. |
| ❌ Falsa | Solo con el veredicto de un verificador, que siempre se enlaza. |

## Contraste con la hemeroteca

En noticias sobre declaraciones, posiciones o cifras de personas o partidos con nombre, el
artículo puede incluir:

- **Hechos objetivos** y **antecedentes**, cada uno con su fuente enlazada y su fecha.
- **Posibles incoherencias**, con un nivel de confianza y el contexto de cualquier cambio
  de postura. Un cambio de opinión no es por sí mismo una incoherencia.
- **Razonamiento**, que separa lo que dicen los documentos de lo que se deduce de ellos.

La IA solo puede usar documentos que ha consultado en el momento, nunca su memoria. Todo
lo que no tenga enlace y fecha se elimina automáticamente antes de publicar.

## Comprobaciones automáticas

- Una noticia «Verificada» sin dos grupos independientes ni agencia pasa a «Sin confirmar».
- Una noticia «Falsa» sin el enlace a un verificador pasa a «Disputada» o «Sin confirmar».
- Se eliminan los antecedentes y las incoherencias sin enlace y fecha, y los bulos sin
  enlace a un verificador.
- No se publica si hay citas demasiado largas, pasajes copiados de los medios, fuentes
  fuera de la lista, enlaces a dominios bloqueados o enlaces rotos.

## Imágenes

Las fotografías de prensa no se copian: se muestran enlazadas desde el medio que las publica,
con su crédito. Cuando se usa una imagen con licencia libre (por ejemplo, de Wikimedia
Commons), se indican su autor y su licencia.

## Limitaciones

- Algunos medios no permiten que la IA abra sus páginas. En ese caso, el resumen se basa
  en los titulares y entradillas que el propio medio publica en su RSS y en otros medios.
- Los veredictos de los verificadores se recogen tal como los publican.
- Es un proyecto personal y automatizado. Para información de última hora, consulta
  directamente los medios enlazados.
