# Resumen de noticias: sitio web

Contenido publicado de un resumen diario automatizado de noticias de España, y el sitio
generado a partir de él: https://fjgarciahurtado.github.io/ai-news-site/

| Carpeta | Contiene |
|---|---|
| `diario/` | Resúmenes diarios |
| `articulos/` | Una página por noticia |
| `paginas/` | Metodología, Política de fuentes, Correcciones, Aviso sobre IA |
| `config/` | Lista de medios, dominios bloqueados, verificadores y áreas |
| `site/` | Sitio Astro, publicado en GitHub Pages por `.github/workflows/pages.yml` |

Este repositorio se genera automáticamente y se sobrescribe en cada publicación: los cambios
hechos aquí se pierden. Cada commit refleja un commit del repositorio privado del proyecto.

Los textos son resúmenes escritos por IA (Claude) a partir de medios españoles, con citas
breves y enlaces a las fuentes. Ver `paginas/aviso-ia.md` y `paginas/metodologia.md`.
