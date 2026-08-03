import ExcelJS from "exceljs";

export const validPdfBuffer = Buffer.from(
  "%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"
);

/** Cabecera MZ = ejecutable Windows (PE), pero se sube declarando .pdf (TC-08). */
export const fakeExeDisguisedAsPdf = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

export async function buildValidAssetInventoryXlsx(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Activos");
  sheet.addRow(["IP", "Criticidad", "Responsable"]);
  sheet.addRow(["10.0.0.5", "Alta", "QA Tenant A"]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Le falta la columna "Responsable" exigida por el requisito A.8.1.1 (TC-09). */
export async function buildIncompleteAssetInventoryXlsx(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Activos");
  sheet.addRow(["IP", "Criticidad"]);
  sheet.addRow(["10.0.0.5", "Alta"]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
