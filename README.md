# Demo de cierre: moderar comentarios con Jev

Ocho comentarios de YouTube (`comentarios.json`), cuatro preguntas en una llamada por comentario y la decisión en código según el riesgo. Es la sección "DEMO FINAL" de `../script.md`.

```bash
npm install
cp .env.example .env   # y pega tu TYPESAFE_API_KEY
npm run moderar
npm run typecheck      # tsc estricto contra @typesafe-ai/sdk 0.6.0
```

- Modelo fijado: `jev-1.13.0`. Node 24 ejecuta el `.ts` directamente.
- Los comentarios son inventados. El #8 lleva una instrucción inyectada a propósito.
- Los números (confianzas, tiempos, coste) cambian en cada ejecución: en el vídeo se leen de la pantalla.
