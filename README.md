# Investment Dashboard

Dashboard de finanzas personales conectado en tiempo real a Google Sheets. Permite visualizar la evolución de la cartera, distribución de activos, rendimiento histórico y cargar nuevas tenencias desde el PDF mensual de Cocos Capital.

## Stack

- **Next.js 15** (App Router) + **TypeScript**
- **Recharts** — gráficos interactivos
- **Google Sheets API v4** — fuente de datos vía Service Account
- **unpdf** — extracción de texto de PDFs en entornos serverless
- **Tailwind CSS** — estilos base

## Funcionalidades

- KPIs: total de cartera, aportes acumulados, rendimiento neto y TIR anual
- Evolución mensual de cartera vs. aportes acumulados
- Evolución apilada por dimensión (tipo de activo, riesgo, moneda, renta, geografía)
- Treemap interactivo de tenencias con filtros cruzados
- Slider de período para explorar snapshots mensuales
- Carga de tenencias desde PDF de Cocos Capital (parsing local, sin APIs externas)
- Tema claro / oscuro
- Botón para ocultar valores sensibles

## Estructura

```
app/
  page.tsx                     — Server Component, fetcha datos (revalidate 60s)
  layout.tsx                   — metadata + tema base
  globals.css                  — CSS variables del tema
  api/upload-tenencias/
    route.ts                   — GET meses cargados / POST procesar PDF → Sheets
components/
  Dashboard.tsx                — Client Component principal (tabs, filtros, estado)
  KPICard.tsx                  — Card de KPI
  EvolucionChart.tsx           — AreaChart cartera vs aportes
  EvolucionTipoChart.tsx       — AreaChart apilado por dimensión + toggle USD/%
  TreemapChart.tsx             — Treemap de tenencias con drill-down
  MonthSlider.tsx              — Slider custom para navegar entre meses
  UploadTenencias.tsx          — UI para subir PDF mensual de Cocos
lib/
  sheets.ts                    — fetchDashboardData() con googleapis
  parser.ts                    — parseArgNum, parseFechaDia, formatMesLabel, toMesKey, fmtUSD, fmtPct
  finance.ts                   — xirr() Newton-Raphson para TIR anual
  constants.ts                 — Paletas y labels por dimensión
types/
  index.ts                     — Tipos TypeScript compartidos
legacy/streamlit/              — Versión anterior en Streamlit (archivada)
```

## Setup local

### 1. Clonar e instalar dependencias

```bash
git clone https://github.com/nicolasmenna0203/Dashboard-Finanzas.git
cd Dashboard-Finanzas
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

| Variable | Descripción |
|---|---|
| `SPREADSHEET_ID` | ID del Google Sheet (en la URL de Sheets) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON completo de la Service Account (una sola línea) |

### 3. Compartir el Sheet con la Service Account

En Google Sheets → Compartir → pegar el `client_email` del JSON → rol **Editor** (necesario para cargar tenencias).

### 4. Correr en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Deploy en Vercel

1. Conectar el repositorio en [vercel.com](https://vercel.com)
2. Agregar en **Settings → Environment Variables**:
   - `SPREADSHEET_ID`
   - `GOOGLE_SERVICE_ACCOUNT_JSON` (JSON minificado en una línea)

## Estructura del Google Sheet

| Hoja | Columnas | Descripción |
|---|---|---|
| `Activos` | TICKER, BROKER, TIPO, RIESGO, SECTOR GEO, RENTA, MONEDA | Catálogo de instrumentos |
| `Movimientos` | Fecha, Monto (USD), Ingreso/Salida | Flujos de caja — `ingreso` suma al acumulado, `salida` resta |
| `Tenencias` | Ticker, Tenencia (ARS), Tenencia (USD), Fecha | Snapshots mensuales de posiciones |

### Cálculo de métricas

Todo se deriva en código a partir de las 3 hojas, sin hoja Resumen:

- **Total cartera**: suma de `Tenencia (USD)` de todos los activos del mes
- **Aportes acumulados**: suma acumulada del neto de movimientos hasta ese mes
- **Rendimiento neto**: `total_cartera − aportes_acumulados`
- **TIR anual**: XIRR con Newton-Raphson — movimientos como flujos de caja + valor actual de cartera como flujo terminal

## Carga de tenencias

En la tab **Cargar Mes**, arrastrar o seleccionar el PDF mensual de Cocos Capital. El sistema:
1. Extrae el texto del PDF localmente (sin APIs externas)
2. Detecta automáticamente el mes y el tipo de cambio MEP
3. Parsea todos los instrumentos de la última sección de cierre
4. Sube las filas a Tenencias con fecha = último día del mes
5. Previene cargar un mes ya existente
