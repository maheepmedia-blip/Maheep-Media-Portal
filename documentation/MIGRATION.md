# Legacy Migration Guide — Google Sites, Sheets & Drive Archive

## Safety First
- Never delete your existing Google Sheets, Google Drive PDFs, or Google Sites website until the new portal is verified in production.

## Importing Google Sheets Articles
Export your Google Sheet as `.xlsx`, `.csv`, or `.json` with columns:
`title`, `summary`, `content`, `category`, `state`, `language`, `published_at`, `source_name`, `source_url`, `author`.

### Option A: Admin Dashboard Upload
Open `/admin` -> **Sheets Migration**, select your exported `.csv` / `.xlsx` / `.json` file, preview rows, and click **Validate & Import**. Any invalid row is flagged with its exact row number and reason—nothing is silently dropped.

### Option B: CLI Script
```powershell
npx tsx scripts/migration/import-sheets.ts .\path\to\google-sheets-export.xlsx
```
