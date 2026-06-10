type ExcelCellValue = string | number | boolean | null | undefined;

export type ExcelSheet = {
  name: string;
  rows: ExcelCellValue[][];
};

function escapeXml(value: ExcelCellValue) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cellType(value: ExcelCellValue) {
  return typeof value === "number" && Number.isFinite(value) ? "Number" : "String";
}

function safeSheetName(name: string) {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet";
}

function worksheetXml(sheet: ExcelSheet) {
  const rows = sheet.rows
    .map(
      (row) => `
      <Row>${row
        .map((cell) => `<Cell><Data ss:Type="${cellType(cell)}">${escapeXml(cell)}</Data></Cell>`)
        .join("")}</Row>`,
    )
    .join("");

  return `
    <Worksheet ss:Name="${escapeXml(safeSheetName(sheet.name))}">
      <Table>${rows}
      </Table>
    </Worksheet>`;
}

export function downloadExcelWorkbook(filename: string, sheets: ExcelSheet[]) {
  const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  ${sheets.map(worksheetXml).join("")}
</Workbook>`;
  const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}
